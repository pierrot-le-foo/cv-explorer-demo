#!/usr/bin/env python3
"""
Profile Picture Extraction Script

This script extracts profile pictures from PDF resumes by:
1. Converting the first page of each PDF to an image
2. Using image processing to detect and extract potential profile pictures
3. Saving both full page previews and cropped profile picture candidates

Requirements:
- pdf2image (for PDF to image conversion)
- Pillow (for image processing)
- PostgreSQL connection for resume metadata
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import subprocess

# Add the project root to Python path
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

try:
    from pdf2image import convert_from_path
    from PIL import Image, ImageFilter, ImageEnhance
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError as e:
    print(f"❌ Missing required Python package: {e}")
    print("🔧 Install required packages:")
    print("   pip install pdf2image pillow psycopg2-binary")
    print("   # On Ubuntu/Debian:")
    print("   sudo apt-get install poppler-utils")
    print("   # On macOS:")
    print("   brew install poppler")
    sys.exit(1)

# Configuration
CONFIG = {
    'database_url': os.getenv('DATABASE_URL', 'postgresql://user:password@localhost:5490/cv_explorer'),
    'output_dirs': {
        'profile_pictures': project_root / 'public' / 'profile-pictures',
        'resume_previews': project_root / 'public' / 'resume-previews',
        'temp': project_root / 'temp' / 'pdf-processing'
    },
    'resumes_dir': project_root / 'resumes',
    'conversion': {
        'dpi': 200,
        'format': 'PNG',
        'first_page_only': True
    },
    'profile_detection': {
        'min_size': 100,
        'max_size': 800,
        'top_area_ratio': 0.4,
        'right_area_ratio': 0.35,
        'left_area_ratio': 0.35,
        'aspect_ratio_tolerance': 0.3
    }
}

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

class ProfilePictureExtractor:
    def __init__(self):
        self.setup_directories()
        self.results = []

    def setup_directories(self):
        """Create necessary directories"""
        for dir_path in CONFIG['output_dirs'].values():
            dir_path.mkdir(parents=True, exist_ok=True)
            logger.info(f"📁 Directory ready: {dir_path.relative_to(project_root)}")

    def get_resumes_from_db(self) -> List[Dict]:
        """Fetch resume metadata from PostgreSQL database"""
        try:
            conn = psycopg2.connect(CONFIG['database_url'])
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute("""
                SELECT id, document, cmetadata 
                FROM langchain_pg_embedding 
                ORDER BY id DESC
            """)
            
            resumes = cursor.fetchall()
            cursor.close()
            conn.close()
            
            logger.info(f"📊 Found {len(resumes)} resumes in database")
            return resumes
            
        except Exception as e:
            logger.error(f"❌ Database error: {e}")
            return []

    def convert_pdf_to_image(self, pdf_path: Path, resume_id: str) -> Optional[Tuple[Path, Path]]:
        """Convert PDF first page to image and save both full and cropped versions"""
        try:
            # Convert PDF to image
            images = convert_from_path(
                pdf_path,
                dpi=CONFIG['conversion']['dpi'],
                first_page_only=CONFIG['conversion']['first_page_only'],
                fmt=CONFIG['conversion']['format']
            )
            
            if not images:
                return None
                
            image = images[0]
            
            # Save full page preview
            full_page_path = CONFIG['output_dirs']['resume_previews'] / f"{resume_id}.png"
            image.save(full_page_path, 'PNG', quality=95)
            
            # Extract profile picture candidate
            profile_pic_path = self.extract_profile_picture(image, resume_id)
            
            logger.info(f"📄 Converted PDF to images: {resume_id}")
            return full_page_path, profile_pic_path
            
        except Exception as e:
            logger.error(f"❌ Error converting PDF for {resume_id}: {e}")
            return None

    def extract_profile_picture(self, image: Image.Image, resume_id: str) -> Optional[Path]:
        """Extract potential profile picture from resume image"""
        try:
            width, height = image.size
            
            # Define extraction regions (common profile picture locations)
            regions = [
                # Top-right corner
                {
                    'name': 'top_right',
                    'box': (
                        int(width * (1 - CONFIG['profile_detection']['right_area_ratio'])),
                        0,
                        width,
                        int(height * CONFIG['profile_detection']['top_area_ratio'])
                    )
                },
                # Top-left corner
                {
                    'name': 'top_left',
                    'box': (
                        0,
                        0,
                        int(width * CONFIG['profile_detection']['left_area_ratio']),
                        int(height * CONFIG['profile_detection']['top_area_ratio'])
                    )
                },
                # Center-right
                {
                    'name': 'center_right',
                    'box': (
                        int(width * 0.7),
                        int(height * 0.1),
                        width,
                        int(height * 0.5)
                    )
                }
            ]
            
            best_region = None
            best_score = 0
            
            for region in regions:
                cropped = image.crop(region['box'])
                score = self.analyze_region_for_profile(cropped)
                
                if score > best_score:
                    best_score = score
                    best_region = cropped
            
            if best_region and best_score > 0.3:  # Threshold for accepting a region
                # Enhance the extracted region
                enhanced = self.enhance_profile_picture(best_region)
                
                # Save the profile picture candidate
                profile_pic_path = CONFIG['output_dirs']['profile_pictures'] / f"{resume_id}.png"
                enhanced.save(profile_pic_path, 'PNG', quality=95)
                
                logger.info(f"🖼️  Extracted profile picture candidate: {resume_id}.png (score: {best_score:.2f})")
                return profile_pic_path
            else:
                # Save a default crop from top-right for manual review
                default_crop = image.crop(regions[0]['box'])
                profile_pic_path = CONFIG['output_dirs']['profile_pictures'] / f"{resume_id}.png"
                default_crop.save(profile_pic_path, 'PNG', quality=95)
                
                logger.info(f"📷 Saved default crop for manual review: {resume_id}.png")
                return profile_pic_path
                
        except Exception as e:
            logger.error(f"❌ Error extracting profile picture for {resume_id}: {e}")
            return None

    def analyze_region_for_profile(self, image: Image.Image) -> float:
        """Analyze a region to determine likelihood of containing a profile picture"""
        try:
            # Convert to grayscale for analysis
            gray = image.convert('L')
            
            # Basic heuristics for profile picture detection
            score = 0.0
            
            # 1. Size check (profile pics are usually not too small or too large)
            width, height = gray.size
            if CONFIG['profile_detection']['min_size'] <= min(width, height) <= CONFIG['profile_detection']['max_size']:
                score += 0.3
            
            # 2. Aspect ratio check (profile pics tend to be square-ish)
            aspect_ratio = width / height
            if 0.7 <= aspect_ratio <= 1.3:  # Close to square
                score += 0.4
            
            # 3. Edge detection (faces have distinct edges)
            edges = gray.filter(ImageFilter.FIND_EDGES)
            edge_data = list(edges.getdata())
            edge_intensity = sum(edge_data) / len(edge_data)
            
            if 20 <= edge_intensity <= 80:  # Moderate edge intensity suggests structured content
                score += 0.3
            
            return score
            
        except Exception:
            return 0.0

    def enhance_profile_picture(self, image: Image.Image) -> Image.Image:
        """Apply basic enhancements to extracted profile picture"""
        try:
            # Resize to standard profile picture size
            target_size = (300, 300)
            
            # Maintain aspect ratio
            image.thumbnail(target_size, Image.Resampling.LANCZOS)
            
            # Create a square canvas
            canvas = Image.new('RGB', target_size, (255, 255, 255))
            
            # Center the image on the canvas
            x_offset = (target_size[0] - image.width) // 2
            y_offset = (target_size[1] - image.height) // 2
            canvas.paste(image, (x_offset, y_offset))
            
            # Enhance contrast slightly
            enhancer = ImageEnhance.Contrast(canvas)
            enhanced = enhancer.enhance(1.1)
            
            # Enhance sharpness slightly
            enhancer = ImageEnhance.Sharpness(enhanced)
            enhanced = enhancer.enhance(1.1)
            
            return enhanced
            
        except Exception:
            return image

    def process_all_resumes(self):
        """Main processing function"""
        logger.info("🚀 Starting profile picture extraction process...")
        
        # Get resumes from database
        resumes = self.get_resumes_from_db()
        if not resumes:
            logger.error("❌ No resumes found or database connection failed")
            return
        
        success_count = 0
        error_count = 0
        
        for resume in resumes:
            try:
                resume_id = resume['id']
                cmetadata = resume['cmetadata']
                
                logger.info(f"\n🔄 Processing: {resume_id}")
                
                # Get source filename
                source_filename = cmetadata.get('source')
                if not source_filename:
                    self.results.append({
                        'resume_id': resume_id,
                        'filename': 'unknown',
                        'success': False,
                        'error': 'No source filename in metadata'
                    })
                    error_count += 1
                    continue
                
                # Check if PDF exists
                pdf_path = CONFIG['resumes_dir'] / source_filename
                if not pdf_path.exists():
                    self.results.append({
                        'resume_id': resume_id,
                        'filename': source_filename,
                        'success': False,
                        'error': 'PDF file not found'
                    })
                    error_count += 1
                    continue
                
                # Convert and extract
                result = self.convert_pdf_to_image(pdf_path, resume_id)
                if result:
                    full_page_path, profile_pic_path = result
                    self.results.append({
                        'resume_id': resume_id,
                        'filename': source_filename,
                        'success': True,
                        'full_page_image': str(full_page_path.relative_to(project_root)),
                        'profile_picture': str(profile_pic_path.relative_to(project_root)) if profile_pic_path else None
                    })
                    success_count += 1
                else:
                    self.results.append({
                        'resume_id': resume_id,
                        'filename': source_filename,
                        'success': False,
                        'error': 'Failed to convert PDF to image'
                    })
                    error_count += 1
                    
            except Exception as e:
                self.results.append({
                    'resume_id': resume.get('id', 'unknown'),
                    'filename': resume.get('cmetadata', {}).get('source', 'unknown'),
                    'success': False,
                    'error': str(e)
                })
                error_count += 1
        
        # Generate report
        self.generate_report(success_count, error_count)

    def generate_report(self, success_count: int, error_count: int):
        """Generate and save processing report"""
        logger.info('\n📋 Extraction Summary:')
        logger.info(f'✅ Successfully processed: {success_count} resumes')
        logger.info(f'❌ Failed: {error_count} resumes')
        logger.info(f'📁 Full page images: {CONFIG["output_dirs"]["resume_previews"].relative_to(project_root)}')
        logger.info(f'📁 Profile pictures: {CONFIG["output_dirs"]["profile_pictures"].relative_to(project_root)}')
        
        # Save detailed report
        report_path = project_root / 'profile-picture-extraction-report.json'
        with open(report_path, 'w') as f:
            json.dump(self.results, f, indent=2)
        logger.info(f'📊 Detailed report: {report_path.relative_to(project_root)}')
        
        # Show successful extractions
        successful = [r for r in self.results if r['success']]
        if successful:
            logger.info('\n✅ Successfully processed:')
            for result in successful[:10]:  # Show first 10
                logger.info(f"  - {result['resume_id']}: {result['profile_picture']}")
            if len(successful) > 10:
                logger.info(f"  ... and {len(successful) - 10} more")
        
        # Show errors
        failed = [r for r in self.results if not r['success']]
        if failed:
            logger.info('\n❌ Failed extractions:')
            for result in failed[:5]:  # Show first 5 errors
                logger.info(f"  - {result['resume_id']}: {result['error']}")
            if len(failed) > 5:
                logger.info(f"  ... and {len(failed) - 5} more errors")
        
        logger.info('\n🎉 Profile picture extraction completed!')
        logger.info('\n💡 Next steps:')
        logger.info('  - Review extracted profile pictures in public/profile-pictures/')
        logger.info('  - Use full page previews from public/resume-previews/')
        logger.info('  - Consider manual review of profile picture candidates')

def cleanup_extracted_files():
    """Clean up all extracted files"""
    logger.info("🧹 Cleaning up extracted files...")
    
    cleanup_count = 0
    for output_dir in CONFIG['output_dirs'].values():
        if output_dir.exists():
            for file_path in output_dir.glob('*.png'):
                file_path.unlink()
                cleanup_count += 1
                logger.info(f"🗑️  Removed: {file_path.name}")
    
    logger.info(f"🧹 Cleaned up {cleanup_count} files")

def main():
    """Main entry point"""
    if len(sys.argv) > 1:
        if sys.argv[1] in ['--cleanup', '-c']:
            cleanup_extracted_files()
            return
        elif sys.argv[1] in ['--help', '-h']:
            print("""
Profile Picture Extraction Script

Usage:
  python scripts/extract_profile_pictures.py           Extract profile pictures
  python scripts/extract_profile_pictures.py --cleanup Clean up extracted files
  python scripts/extract_profile_pictures.py --help    Show this help

Description:
  Extracts profile pictures from PDF resumes using computer vision techniques.
  Creates both full page previews and cropped profile picture candidates.

Requirements:
  - pdf2image: pip install pdf2image
  - Pillow: pip install pillow
  - psycopg2: pip install psycopg2-binary
  - System: poppler-utils (Ubuntu) or poppler (macOS)
            """)
            return
    
    # Run the extraction
    extractor = ProfilePictureExtractor()
    extractor.process_all_resumes()

if __name__ == '__main__':
    main()

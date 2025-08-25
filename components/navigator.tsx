'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Briefcase, Users, Settings } from 'lucide-react';
import Resumes from '@/components/resumes';

// Placeholder components for the other tabs
const JobOffers = () => (
  <div className="h-full flex items-center justify-center p-6">
    <div className="text-center">
      <Briefcase className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">Job Offers</h3>
      <p className="text-muted-foreground">Job offers management coming soon...</p>
    </div>
  </div>
);

const Matches = () => (
  <div className="h-full flex items-center justify-center p-6">
    <div className="text-center">
      <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">Matches</h3>
      <p className="text-muted-foreground">Resume-job matching results coming soon...</p>
    </div>
  </div>
);

const SettingsPanel = () => (
  <div className="h-full flex items-center justify-center p-6">
    <div className="text-center">
      <Settings className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">Settings</h3>
      <p className="text-muted-foreground">Application settings coming soon...</p>
    </div>
  </div>
);

const Navigator = () => {
  return (
    <div className="h-full">
      <Tabs defaultValue="resumes" className="h-full flex flex-col">
        <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <TabsList className="h-12 w-full justify-start rounded-none bg-transparent p-0">
            <TabsTrigger 
              value="resumes" 
              className="h-12 px-6 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <FileText className="h-4 w-4 mr-2" />
              Resumes
            </TabsTrigger>
            <TabsTrigger 
              value="job-offers" 
              className="h-12 px-6 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Job Offers
            </TabsTrigger>
            <TabsTrigger 
              value="matches" 
              className="h-12 px-6 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Users className="h-4 w-4 mr-2" />
              Matches
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className="h-12 px-6 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <TabsContent value="resumes" className="h-full m-0 p-0">
            <Resumes />
          </TabsContent>
          
          <TabsContent value="job-offers" className="h-full m-0 p-0">
            <JobOffers />
          </TabsContent>
          
          <TabsContent value="matches" className="h-full m-0 p-0">
            <Matches />
          </TabsContent>
          
          <TabsContent value="settings" className="h-full m-0 p-0">
            <SettingsPanel />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default Navigator;

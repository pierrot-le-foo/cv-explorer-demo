'use client';
import Chat from '@/components/chat';

const ConversationDemo = () => {
  return (
    <div className='w-screen h-screen overflow-hidden flex items-center justify-center bg-background'>
      <div className="w-full max-w-4xl h-full p-6">
        <Chat />
      </div>
    </div>
  );
};

export default ConversationDemo;
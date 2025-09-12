import React, { useState, useEffect } from 'react';
import { Shield, Zap, Globe } from 'lucide-react';
import { FileUpload } from './FileUpload';
import coffeeHero from '@/assets/coffee-hero.jpg';

const AnimatedHeading = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  const texts = [
    'warmth of coffee',
    'ease of sharing coffee'
  ];
  
  useEffect(() => {
    let timeout;
    const currentText = texts[currentIndex];
    
    if (!isDeleting && displayText === currentText) {
      // Pause before starting to delete
      timeout = setTimeout(() => setIsDeleting(true), 1500);
    } else if (isDeleting && displayText === '') {
      // Switch to next text and start typing
      setCurrentIndex((prev) => (prev + 1) % texts.length);
      setIsDeleting(false);
    } else if (isDeleting) {
      // Deleting characters
      timeout = setTimeout(() => {
        setDisplayText(currentText.substring(0, displayText.length - 1));
      }, 40);
    } else {
      // Adding characters
      timeout = setTimeout(() => {
        setDisplayText(currentText.substring(0, displayText.length + 1));
      }, 80);
    }
    
    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, currentIndex]);
  
  return (
    <span className="block bg-gradient-coffee bg-clip-text text-transparent min-h-[4rem] flex items-center">
      {displayText}
      <span className="animate-pulse ml-2 text-primary opacity-70">|</span>
    </span>
  );
};

export const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center">
      {/* Background with overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${coffeeHero})`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-background/95 via-background/90 to-background/95" />
      </div>

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-bold leading-tight">
                Share files with the
                <AnimatedHeading />
              </h1>
              <p className="text-xl text-muted-foreground max-w-lg">
                Share files directly between devices using WebRTC technology. No servers, no storage, 
                just pure peer-to-peer transfer as smooth as your morning brew.
              </p>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center gap-3 p-4 bg-card rounded-lg border">
                <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Secure</h3>
                  <p className="text-sm text-muted-foreground">WebRTC encryption</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-card rounded-lg border">
                <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Fast</h3>
                  <p className="text-sm text-muted-foreground">P2P direct transfer</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-card rounded-lg border">
                <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg">
                  <Globe className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Global</h3>
                  <p className="text-sm text-muted-foreground">Anywhere access</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right content - File Upload */}
          <div className="lg:pl-8">
            <FileUpload />
          </div>
        </div>
      </div>
    </section>
  );
};
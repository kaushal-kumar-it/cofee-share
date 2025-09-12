import React from 'react';
import { Shield, Zap, Globe, Wifi, Lock, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';

export const About = () => {
  return (
    <section id="about" className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Why Choose 
            <span className="block bg-gradient-coffee bg-clip-text text-transparent">
              Cofee Share?
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Experience the future of file sharing with WebRTC technology. Direct, secure, and lightning-fast transfers without any intermediaries.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <Card className="p-8 bg-gradient-cream border-2 border-primary/10 hover:border-primary/30 transition-all hover:shadow-coffee">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-6 bg-gradient-coffee rounded-full">
              <Wifi className="w-8 h-8 text-primary-foreground" />
            </div>
            <h3 className="text-xl font-bold text-center mb-4">WebRTC Technology</h3>
            <p className="text-muted-foreground text-center">
              Powered by WebRTC for direct peer-to-peer connections. Your files travel directly from sender to receiver without any servers in between.
            </p>
          </Card>

          <Card className="p-8 bg-gradient-cream border-2 border-primary/10 hover:border-primary/30 transition-all hover:shadow-coffee">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-6 bg-gradient-coffee rounded-full">
              <Lock className="w-8 h-8 text-primary-foreground" />
            </div>
            <h3 className="text-xl font-bold text-center mb-4">End-to-End Security</h3>
            <p className="text-muted-foreground text-center">
              Built-in encryption ensures your files remain private. No data is stored on our servers - everything happens directly between devices.
            </p>
          </Card>

          <Card className="p-8 bg-gradient-cream border-2 border-primary/10 hover:border-primary/30 transition-all hover:shadow-coffee">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-6 bg-gradient-coffee rounded-full">
              <Zap className="w-8 h-8 text-primary-foreground" />
            </div>
            <h3 className="text-xl font-bold text-center mb-4">Lightning Fast</h3>
            <p className="text-muted-foreground text-center">
              No upload delays or download limits. Files transfer at the maximum speed your internet connection allows.
            </p>
          </Card>

          <Card className="p-8 bg-gradient-cream border-2 border-primary/10 hover:border-primary/30 transition-all hover:shadow-coffee">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-6 bg-gradient-coffee rounded-full">
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
            <h3 className="text-xl font-bold text-center mb-4">No Size Limits</h3>
            <p className="text-muted-foreground text-center">
              Share files of any size - from documents to large video files. WebRTC handles it all without restrictions.
            </p>
          </Card>

          <Card className="p-8 bg-gradient-cream border-2 border-primary/10 hover:border-primary/30 transition-all hover:shadow-coffee">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-6 bg-gradient-coffee rounded-full">
              <Globe className="w-8 h-8 text-primary-foreground" />
            </div>
            <h3 className="text-xl font-bold text-center mb-4">Works Anywhere</h3>
            <p className="text-muted-foreground text-center">
              Cross-platform compatibility means you can share between any devices with a modern web browser.
            </p>
          </Card>

          <Card className="p-8 bg-gradient-cream border-2 border-primary/10 hover:border-primary/30 transition-all hover:shadow-coffee">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-6 bg-gradient-coffee rounded-full">
              <Users className="w-8 h-8 text-primary-foreground" />
            </div>
            <h3 className="text-xl font-bold text-center mb-4">Simple Sharing</h3>
            <p className="text-muted-foreground text-center">
              Just generate a link and share. Recipients don't need accounts or downloads - just click and receive.
            </p>
          </Card>
        </div>

        <div className="text-center">
          <div className="bg-background p-8 rounded-lg border max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold mb-4">How WebRTC Works</h3>
            <p className="text-muted-foreground text-lg leading-relaxed">
              WebRTC (Web Real-Time Communication) creates direct connections between browsers, 
              eliminating the need for file uploads to servers. When you share a file, it streams 
              directly from your device to the recipient's device in real-time, ensuring maximum 
              privacy and speed. It's like having a direct tunnel between devices.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
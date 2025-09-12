import React, { useState } from 'react';
import { Mail, MessageCircle, Coffee, Github, Check, Copy, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const Contact = () => {
  const [emailCopied, setEmailCopied] = useState(false);
  const [isContactFormOpen, setIsContactFormOpen] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const copyEmailToClipboard = async () => {
    try {
      await navigator.clipboard.writeText('techs308@gmail.com');
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy email: ', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = 'techs308@gmail.com';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    }
  };

  const handleContactFormSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData(e.target);
    const formspreeId = import.meta.env.VITE_FORMSPREE_FORM_ID;
    
    if (!formspreeId || formspreeId === 'your_formspree_form_id_here') {
      alert('Formspree form ID not configured. Please set VITE_FORMSPREE_FORM_ID in your .env file.');
      setIsSubmitting(false);
      return;
    }
    
    try {
      const response = await fetch(`https://formspree.io/f/${formspreeId}`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        setFormSubmitted(true);
        setTimeout(() => {
          setIsContactFormOpen(false);
          setFormSubmitted(false);
        }, 2000);
      } else {
        throw new Error('Form submission failed');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('There was an error sending your message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <section id="contact" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Get in 
            <span className="block bg-gradient-coffee bg-clip-text text-transparent">
              Touch
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Have questions about Cofee Share? Want to contribute or report an issue? 
            We'd love to hear from you over a virtual cup of coffee.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <Card className="p-6 bg-gradient-cream border-2 border-primary/10 hover:border-primary/30 transition-all hover:shadow-coffee text-center">
            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-4 bg-gradient-coffee rounded-full">
              <Mail className="w-7 h-7 text-primary-foreground" />
            </div>
            <h3 className="font-bold mb-2">Email Us</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get in touch for support or feedback
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full flex items-center gap-2"
              onClick={copyEmailToClipboard}
            >
              {emailCopied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  techs308@gmail.com
                </>
              )}
            </Button>
          </Card>

          <Card className="p-6 bg-gradient-cream border-2 border-primary/10 hover:border-primary/30 transition-all hover:shadow-coffee text-center">
            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-4 bg-gradient-coffee rounded-full">
              <MessageCircle className="w-7 h-7 text-primary-foreground" />
            </div>
            <h3 className="font-bold mb-2">Live Chat</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Quick questions? Chat with our team
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full"
              onClick={() => setIsContactFormOpen(true)}
            >
              Start Chat
            </Button>
          </Card>

          <Card className="p-6 bg-gradient-cream border-2 border-primary/10 hover:border-primary/30 transition-all hover:shadow-coffee text-center">
            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-4 bg-gradient-coffee rounded-full">
              <Github className="w-7 h-7 text-primary-foreground" />
            </div>
            <h3 className="font-bold mb-2">GitHub</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Contribute to the project or report issues
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full"
              onClick={() => {
                const githubUrl = import.meta.env.VITE_GITHUB_URL || 'https://github.com/kaushal-kumar-it/';
                window.open(githubUrl, '_blank');
              }}
            >
              View Repository
            </Button>
          </Card>

          <Card className="p-6 bg-gradient-cream border-2 border-primary/10 hover:border-primary/30 transition-all hover:shadow-coffee text-center">
            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-4 bg-gradient-coffee rounded-full">
              <Coffee className="w-7 h-7 text-primary-foreground" />
            </div>
            <h3 className="font-bold mb-2">Buy Us Coffee</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Support the development of Cofee Share
            </p>
            <Button variant="outline" size="sm" className="w-full">
              Support Project
            </Button>
          </Card>
        </div>

        <div className="text-center">
          <div className="bg-secondary/30 p-8 rounded-lg border max-w-2xl mx-auto">
            <h3 className="text-xl font-bold mb-4">Open Source & Community Driven</h3>
            <p className="text-muted-foreground leading-relaxed">
              Cofee Share is built with love for the community. We believe in transparent, 
              secure file sharing that respects your privacy. Join us in making file sharing 
              better for everyone, one cup of coffee at a time.
            </p>
          </div>
        </div>
      </div>

      {/* Contact Form Modal */}
      {isContactFormOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-semibold">Start a Conversation</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsContactFormOpen(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="p-6">
              {formSubmitted ? (
                <div className="text-center py-8">
                  <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <h4 className="text-lg font-semibold mb-2">Message Sent!</h4>
                  <p className="text-muted-foreground">
                    Thanks for reaching out. We'll get back to you soon!
                  </p>
                </div>
              ) : (
                <form onSubmit={handleContactFormSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium mb-2">
                      Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="Your full name"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium mb-2">
                      Email *
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="your.email@example.com"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium mb-2">
                      Subject
                    </label>
                    <input
                      type="text"
                      id="subject"
                      name="subject"
                      className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="What's this about?"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="message" className="block text-sm font-medium mb-2">
                      Message *
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={4}
                      required
                      className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                      placeholder="Tell us how we can help you..."
                    />
                  </div>
                  
                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsContactFormOpen(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 flex items-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Send Message
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
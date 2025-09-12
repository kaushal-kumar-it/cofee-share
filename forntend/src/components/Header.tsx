import React, { useState } from 'react';
import { Coffee, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export const Header = () => {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogoClick = () => {
    navigate('/');
    setIsMobileMenuOpen(false); // Close mobile menu when navigating
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleNavClick = (sectionId: string) => {
    // If we're not on the home page, navigate to home first, then scroll to section
    if (window.location.pathname !== '/') {
      navigate('/', { replace: true });
      // Wait for navigation to complete, then scroll to section
      setTimeout(() => {
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      // If already on home page, just scroll to section
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const handleMobileNavClick = (sectionId: string) => {
    handleNavClick(sectionId);
    setIsMobileMenuOpen(false); // Close menu after clicking
  };

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div 
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" 
          onClick={handleLogoClick}
        >
          <div className="flex items-center justify-center w-10 h-10 bg-gradient-coffee rounded-lg">
            <Coffee className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-coffee bg-clip-text text-transparent">
            Cofee Share
          </h1>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <button 
            onClick={() => handleNavClick('about')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            About
          </button>
          <button 
            onClick={() => handleNavClick('contact')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Contact
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <Button 
            className="md:hidden" 
            variant="ghost" 
            size="sm"
            onClick={toggleMobileMenu}
            aria-label="Toggle mobile menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-background/95 backdrop-blur-md border-b border-border">
          <nav className="container mx-auto px-4 py-4 flex flex-col gap-4">
            <button
              onClick={() => handleMobileNavClick('about')}
              className="text-left text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              About
            </button>
            <button
              onClick={() => handleMobileNavClick('contact')}
              className="text-left text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              Contact
            </button>
          </nav>
        </div>
      )}
    </header>
  );
};
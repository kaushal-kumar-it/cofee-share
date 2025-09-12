import React, { useState, useCallback } from 'react';
import { Upload, Coffee, Share2, Copy, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface FileUploadProps {
  onFileUpload?: (file: File) => void;
}

export const FileUpload = ({ onFileUpload }: FileUploadProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [shareLink, setShareLink] = useState<string>('');
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleFileSelect = (file: File) => {
    setUploadedFile(file);
    // Generate a mock share link (in real app, this would come from your backend)
    const mockLink = `https://cofeeshare.com/share/${Math.random().toString(36).substr(2, 9)}`;
    setShareLink(mockLink);
    onFileUpload?.(file);
    
    toast({
      title: "File uploaded successfully!",
      description: `${file.name} is ready to share.`,
    });
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
      toast({
        title: "Link copied!",
        description: "Share link has been copied to clipboard.",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually.",
        variant: "destructive",
      });
    }
  };

  const resetUpload = () => {
    setUploadedFile(null);
    setShareLink('');
    setIsLinkCopied(false);
  };

  if (uploadedFile && shareLink) {
    return (
      <Card className="p-8 bg-gradient-cream border-2 border-primary/20 shadow-coffee">
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center w-16 h-16 mx-auto bg-gradient-coffee rounded-full">
            <CheckCircle className="w-8 h-8 text-primary-foreground" />
          </div>
          
          <div>
            <h3 className="text-2xl font-semibold text-foreground mb-2">File Ready to Share!</h3>
            <p className="text-muted-foreground mb-4">
              <span className="font-medium">{uploadedFile.name}</span> ({(uploadedFile.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          </div>

          <div className="bg-background p-4 rounded-lg border">
            <p className="text-sm text-muted-foreground mb-2">Share this link:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shareLink}
                readOnly
                className="flex-1 p-2 bg-secondary rounded border text-sm"
              />
              <Button
                onClick={copyToClipboard}
                variant="outline"
                size="sm"
                className="shrink-0"
              >
                {isLinkCopied ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <Button variant="default" className="bg-gradient-coffee">
              <Share2 className="w-4 h-4 mr-2" />
              Share File
            </Button>
            <Button variant="outline" onClick={resetUpload}>
              Upload Another
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card 
      className={`p-12 border-2 border-dashed transition-all duration-300 ${
        isDragOver 
          ? 'border-primary bg-primary/5 shadow-coffee' 
          : 'border-border hover:border-primary/50 bg-gradient-cream'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="text-center space-y-6">
        <div className="flex items-center justify-center w-20 h-20 mx-auto bg-gradient-coffee rounded-full">
          <Coffee className="w-10 h-10 text-primary-foreground" />
        </div>

        <div>
          <h3 className="text-2xl font-semibold text-foreground mb-2">
            Drop your files here to brew a share
          </h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Drag and drop your files or click to browse. Share files directly from your device with the warmth of coffee.
          </p>
        </div>

        <div className="space-y-4">
          <input
            type="file"
            id="file-upload"
            className="hidden"
            onChange={handleFileInput}
            multiple={false}
          />
          
          <Button 
            variant="default" 
            size="lg" 
            className="bg-gradient-coffee shadow-warm hover:shadow-coffee transition-all"
            onClick={() => navigate('/upload')}
          >
            <Upload className="w-5 h-5 mr-2" />
            Browse Files
          </Button>

          <div className="flex items-center justify-center text-sm text-muted-foreground">
            <span>No file size limits • Secure P2P sharing</span>
          </div>
        </div>
      </div>
    </Card>
  );
};
class CoffeeShare {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.isInitiator = false;
        this.fileQueue = [];
        this.receivingFile = null;
        this.receivedChunks = [];
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupWebRTC();
    }

    initializeElements() {
        // Connection elements
        this.createOfferBtn = document.getElementById('createOffer');
        this.createAnswerBtn = document.getElementById('createAnswer');
        this.offerSection = document.getElementById('offerSection');
        this.answerSection = document.getElementById('answerSection');
        this.offerText = document.getElementById('offerText');
        this.answerText = document.getElementById('answerText');
        this.offerInput = document.getElementById('offerInput');
        this.answerInput = document.getElementById('answerInput');
        this.copyOfferBtn = document.getElementById('copyOffer');
        this.copyAnswerBtn = document.getElementById('copyAnswer');
        this.setOfferBtn = document.getElementById('setOffer');
        this.setAnswerBtn = document.getElementById('setAnswer');
        this.connectionStatus = document.getElementById('connectionStatus');
        
        // File elements
        this.fileSection = document.getElementById('fileSection');
        this.fileInput = document.getElementById('fileInput');
        this.sendFileBtn = document.getElementById('sendFile');
        this.fileProgress = document.getElementById('fileProgress');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.fileList = document.getElementById('fileList');
    }

    setupEventListeners() {
        this.createOfferBtn.addEventListener('click', () => this.createOffer());
        this.createAnswerBtn.addEventListener('click', () => this.createAnswer());
        this.copyOfferBtn.addEventListener('click', () => this.copyToClipboard(this.offerText.value));
        this.copyAnswerBtn.addEventListener('click', () => this.copyToClipboard(this.answerText.value));
        this.setOfferBtn.addEventListener('click', () => this.setRemoteOffer());
        this.setAnswerBtn.addEventListener('click', () => this.setRemoteAnswer());
        this.fileInput.addEventListener('change', () => this.onFileSelected());
        this.sendFileBtn.addEventListener('click', () => this.sendFiles());
    }

    setupWebRTC() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(configuration);
        
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', this.peerConnection.iceConnectionState);
            this.updateConnectionStatus();
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            this.updateConnectionStatus();
        };
    }

    async createOffer() {
        this.isInitiator = true;
        this.offerSection.classList.remove('hidden');
        this.answerSection.classList.add('hidden');
        
        // Create data channel
        this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
            ordered: true
        });
        this.setupDataChannel(this.dataChannel);
        
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            this.offerText.value = JSON.stringify(offer);
            this.updateStatus('Offer created. Share it with the receiver.', 'connecting');
        } catch (error) {
            console.error('Error creating offer:', error);
            this.updateStatus('Error creating offer: ' + error.message, 'error');
        }
    }

    createAnswer() {
        this.isInitiator = false;
        this.answerSection.classList.remove('hidden');
        this.offerSection.classList.add('hidden');
        
        // Set up data channel listener
        this.peerConnection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel(this.dataChannel);
        };
        
        this.updateStatus('Waiting for offer from sender.', 'connecting');
    }

    async setRemoteOffer() {
        try {
            const offer = JSON.parse(this.offerInput.value.trim());
            await this.peerConnection.setRemoteDescription(offer);
            
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.answerText.value = JSON.stringify(answer);
            this.updateStatus('Answer created. Share it with the sender.', 'connecting');
        } catch (error) {
            console.error('Error setting offer:', error);
            this.updateStatus('Error processing offer: ' + error.message, 'error');
        }
    }

    async setRemoteAnswer() {
        try {
            const answer = JSON.parse(this.answerInput.value.trim());
            await this.peerConnection.setRemoteDescription(answer);
            this.updateStatus('Connecting...', 'connecting');
        } catch (error) {
            console.error('Error setting answer:', error);
            this.updateStatus('Error processing answer: ' + error.message, 'error');
        }
    }

    setupDataChannel(channel) {
        channel.onopen = () => {
            console.log('Data channel opened');
            this.updateStatus('Connected! You can now share files.', 'connected');
            this.fileSection.classList.remove('hidden');
        };

        channel.onclose = () => {
            console.log('Data channel closed');
            this.updateStatus('Connection closed.', 'error');
        };

        channel.onmessage = (event) => {
            this.handleDataChannelMessage(event.data);
        };

        channel.onerror = (error) => {
            console.error('Data channel error:', error);
            this.updateStatus('Data channel error.', 'error');
        };
    }

    onFileSelected() {
        const files = this.fileInput.files;
        this.sendFileBtn.disabled = files.length === 0 || !this.dataChannel || this.dataChannel.readyState !== 'open';
    }

    async sendFiles() {
        const files = Array.from(this.fileInput.files);
        
        for (const file of files) {
            await this.sendFile(file);
        }
    }

    async sendFile(file) {
        const chunkSize = 16384; // 16KB chunks
        const totalChunks = Math.ceil(file.size / chunkSize);
        
        // Send file metadata
        const metadata = {
            type: 'file-start',
            name: file.name,
            size: file.size,
            totalChunks: totalChunks
        };
        
        this.dataChannel.send(JSON.stringify(metadata));
        
        // Show progress
        this.fileProgress.classList.remove('hidden');
        this.progressFill.style.width = '0%';
        this.progressText.textContent = '0%';
        
        // Send file in chunks
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunk = file.slice(start, end);
            
            const arrayBuffer = await chunk.arrayBuffer();
            
            // Send chunk metadata
            const chunkMetadata = {
                type: 'file-chunk',
                index: i,
                totalChunks: totalChunks
            };
            
            this.dataChannel.send(JSON.stringify(chunkMetadata));
            this.dataChannel.send(arrayBuffer);
            
            // Update progress
            const progress = Math.round(((i + 1) / totalChunks) * 100);
            this.progressFill.style.width = progress + '%';
            this.progressText.textContent = progress + '%';
            
            // Small delay to prevent overwhelming the connection
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        // Send file end signal
        const endMetadata = {
            type: 'file-end',
            name: file.name
        };
        
        this.dataChannel.send(JSON.stringify(endMetadata));
        
        setTimeout(() => {
            this.fileProgress.classList.add('hidden');
        }, 2000);
    }

    handleDataChannelMessage(data) {
        if (typeof data === 'string') {
            // Handle metadata
            const metadata = JSON.parse(data);
            
            switch (metadata.type) {
                case 'file-start':
                    this.receivingFile = {
                        name: metadata.name,
                        size: metadata.size,
                        totalChunks: metadata.totalChunks,
                        receivedChunks: 0
                    };
                    this.receivedChunks = [];
                    console.log('Starting to receive file:', metadata.name);
                    break;
                    
                case 'file-chunk':
                    // Chunk metadata received, actual chunk data will come next
                    break;
                    
                case 'file-end':
                    this.completeFileReceive();
                    break;
            }
        } else {
            // Handle binary data (file chunk)
            if (this.receivingFile) {
                this.receivedChunks.push(data);
                this.receivingFile.receivedChunks++;
                
                const progress = Math.round((this.receivedChunks.length / this.receivingFile.totalChunks) * 100);
                console.log(`Received chunk ${this.receivedChunks.length}/${this.receivingFile.totalChunks} (${progress}%)`);
            }
        }
    }

    completeFileReceive() {
        if (!this.receivingFile) return;
        
        // Combine all chunks into a single blob
        const blob = new Blob(this.receivedChunks);
        
        // Create download link
        this.addReceivedFile(this.receivingFile.name, blob, this.receivingFile.size);
        
        // Reset receiving state
        this.receivingFile = null;
        this.receivedChunks = [];
    }

    addReceivedFile(fileName, blob, size) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        
        const fileNameDiv = document.createElement('div');
        fileNameDiv.className = 'file-name';
        fileNameDiv.textContent = fileName;
        
        const fileSizeDiv = document.createElement('div');
        fileSizeDiv.className = 'file-size';
        fileSizeDiv.textContent = this.formatFileSize(size);
        
        fileInfo.appendChild(fileNameDiv);
        fileInfo.appendChild(fileSizeDiv);
        
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'download-btn';
        downloadBtn.textContent = 'Download';
        downloadBtn.onclick = () => this.downloadFile(fileName, blob);
        
        fileItem.appendChild(fileInfo);
        fileItem.appendChild(downloadBtn);
        
        this.fileList.appendChild(fileItem);
    }

    downloadFile(fileName, blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            console.log('Copied to clipboard');
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
    }

    updateConnectionStatus() {
        const state = this.peerConnection.connectionState;
        
        switch (state) {
            case 'connected':
                this.updateStatus('Connected! You can now share files.', 'connected');
                break;
            case 'connecting':
                this.updateStatus('Connecting...', 'connecting');
                break;
            case 'disconnected':
            case 'failed':
            case 'closed':
                this.updateStatus('Connection failed or closed.', 'error');
                break;
        }
    }

    updateStatus(message, type) {
        this.connectionStatus.textContent = message;
        this.connectionStatus.className = `status ${type}`;
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CoffeeShare();
});
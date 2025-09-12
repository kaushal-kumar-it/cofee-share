# ☕ Coffee Share

A WebRTC-based file sharing application that allows direct peer-to-peer file transfer without servers.

## Features

- 🔒 **Secure**: Direct peer-to-peer transfer using WebRTC
- 🚀 **Fast**: No server bottlenecks, files transfer directly between peers
- 🌐 **No Upload Limits**: Transfer files of any size (limited only by browser memory)
- 💸 **Free**: No server costs, completely client-side application
- 🎨 **Beautiful**: Coffee-themed UI with responsive design

## How to Use

### For the Sender (File Sharer):
1. Open the application in your browser
2. Click "Create Offer (Sender)"
3. Copy the generated offer and share it with the receiver
4. Wait for the receiver to provide an answer
5. Paste the answer and click "Set Answer"
6. Once connected, select files and click "Send Selected Files"

### For the Receiver:
1. Open the application in your browser
2. Click "Join Session (Receiver)"
3. Paste the offer from the sender and click "Set Offer"
4. Copy the generated answer and share it with the sender
5. Once connected, received files will appear with download buttons

## Technical Details

- **WebRTC**: Uses RTCDataChannel for file transfer
- **Chunking**: Large files are split into 16KB chunks for reliable transfer
- **Progress Tracking**: Real-time progress indicators during transfer
- **Multiple Files**: Support for selecting and sending multiple files at once

## Browser Compatibility

Works in all modern browsers that support WebRTC:
- Chrome 56+
- Firefox 52+
- Safari 11+
- Edge 79+

## Running Locally

1. Clone the repository
2. Serve the files using any HTTP server:
   ```bash
   python3 -m http.server 8000
   # or
   npx serve .
   ```
3. Open `http://localhost:8000` in your browser

## Security

- All transfers are encrypted using DTLS (WebRTC default)
- No data passes through external servers
- Signaling is manual (copy/paste) for maximum privacy
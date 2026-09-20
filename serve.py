#!/usr/bin/env python3
"""Serve the casino on your home network.  Run:  python3 serve.py   then open the printed address on your phone."""
import http.server, socket, socketserver, os, sys
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.webmanifest': 'application/manifest+json', '.m4a': 'audio/mp4'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')  # always pick up new art immediately
        super().end_headers()
    def log_message(self, fmt, *args):
        if '404' not in (args[1] if len(args) > 1 else ''): super().log_message(fmt, *args)  # asset probes 404 on purpose
def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); ip = s.getsockname()[0]; s.close(); return ip
    except Exception: return '127.0.0.1'
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('0.0.0.0', PORT), H) as httpd:
    print(f"\n  The Casino is open.\n  On this computer:  http://localhost:{PORT}\n  On your phone:     http://{lan_ip()}:{PORT}   (same Wi-Fi)\n\n  On iPhone: open that in Safari, tap Share, then 'Add to Home Screen'.\n  Ctrl+C to close.\n")
    try: httpd.serve_forever()
    except KeyboardInterrupt: pass

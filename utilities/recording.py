#!/usr/bin/env python3

import subprocess
import os
from datetime import datetime

class RecordingControl:
    def __init__(self):
        self.recording_dir = "/home/robff/robff/recording"
        self.video_process = None
        self.audio_process = None
        self.is_recording = False
        
        # Create recording directory if it doesn't exist
        os.makedirs(self.recording_dir, exist_ok=True)
    
    def start_recording(self):
        if self.is_recording:
            return
            
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        video_file = os.path.join(self.recording_dir, f"video_{timestamp}.mp4")
        audio_file = os.path.join(self.recording_dir, f"audio_{timestamp}.wav")
        
        try:
            # Start video recording (1080p from Pi camera)
            self.video_process = subprocess.Popen([
                "libcamera-vid", "-t", "0", "-o", video_file, 
                "--width", "1920", "--height", "1080", "--framerate", "30"
            ])
            
            # Start audio recording (USB audio device)
            self.audio_process = subprocess.Popen([
                "arecord", "-D", "plughw:3,0", "-f", "cd", "-t", "wav", audio_file
            ])
            
            self.is_recording = True
            print(f"Recording started: {video_file}, {audio_file}")
            
        except Exception as e:
            print(f"Failed to start recording: {e}")
            self.stop_recording()
    
    def stop_recording(self):
        if not self.is_recording:
            return
            
        try:
            if self.video_process:
                self.video_process.terminate()
                self.video_process.wait()
                self.video_process = None
                
            if self.audio_process:
                self.audio_process.terminate()
                self.audio_process.wait()
                self.audio_process = None
                
            self.is_recording = False
            print("Recording stopped")
            
        except Exception as e:
            print(f"Error stopping recording: {e}") 
#!/usr/bin/env python3

import subprocess
import os
import signal
import time
from datetime import datetime
import threading
import pyaudio
import numpy as np
import struct
import socket
import json
import wave
from pathlib import Path
import sys

# Add ReSpeaker module path
respeaker_path = "/home/robff/robff/usb_4_mic_array"
if respeaker_path not in sys.path:
    sys.path.append(respeaker_path)

print(f"Added ReSpeaker path: {respeaker_path}")
print(f"Python path: {sys.path}")

# Import ReSpeaker modules
try:
    import usb.core
    import usb.util
    print("✅ USB modules imported")
    
    from tuning import Tuning
    print("✅ Tuning module imported")
    
    RESPEAKER_AVAILABLE = True
    print("✅ ReSpeaker modules loaded successfully")
except ImportError as e:
    print(f"❌ ReSpeaker import failed: {e}")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Files in usb_4_mic_array: {os.listdir('/home/robff/robff/usb_4_mic_array') if os.path.exists('/home/robff/robff/usb_4_mic_array') else 'Directory not found'}")
    RESPEAKER_AVAILABLE = False


class ReSpeakerController:
    """Handles ReSpeaker microphone array DOA and raw audio capture"""
    
    def __init__(self, channels=6, rate=16000, chunk_size=1024):
        self.channels = channels
        self.rate = rate
        self.chunk_size = chunk_size
        self.format = pyaudio.paInt16
        
        self.audio = None
        self.stream = None
        self.device_index = None
        self.usb_device = None
        self.Mic_tuning = None  # Changed variable name to match working example
        
        # Data storage
        self.raw_audio_data = []
        self.doa_data = []
        self.is_capturing = False
        
        # SSH streaming
        self.ssh_socket = None
        self.ssh_connected = False
        
        # DOA tracking
        self.doa_thread = None
        self.current_doa = None
        self.doa_lock = threading.Lock()
        
    def initialize(self):
        """Initialize ReSpeaker hardware and audio interface"""
        if not RESPEAKER_AVAILABLE:
            return False
            
        try:
            # Initialize PyAudio
            self.audio = pyaudio.PyAudio()
            
            # Find ReSpeaker USB device for DOA - Updated to detect any USB port
            self.usb_device = usb.core.find(idVendor=0x2886, idProduct=0x0018)
            if self.usb_device:
                self.Mic_tuning = Tuning(self.usb_device)  # Changed to match working example
                print(f"ReSpeaker USB device initialized for DOA on Bus {self.usb_device.bus:03d} Device {self.usb_device.address:03d}")
                
                # Test DOA reading immediately
                try:
                    test_doa = self.Mic_tuning.direction
                    print(f"Initial DOA test reading: {test_doa}")
                except Exception as e:
                    print(f"Initial DOA test failed: {e}")
            else:
                print("Warning: ReSpeaker USB device not found for DOA")
            
            # Find ReSpeaker audio device - Enhanced detection
            self.device_index = self._find_respeaker_audio_device()
            if self.device_index is None:
                print("Error: ReSpeaker audio device not found")
                return False
                
            print(f"ReSpeaker audio device found at index: {self.device_index}")
            
            # Start DOA reading thread if USB device is available
            if self.Mic_tuning:
                self._start_doa_thread()
            
            return True
            
        except Exception as e:
            print(f"Error initializing ReSpeaker: {e}")
            return False
    
    def _start_doa_thread(self):
        """Start separate thread for DOA readings"""
        if not self.Mic_tuning:
            return
            
        self.doa_thread = threading.Thread(target=self._doa_reading_loop)
        self.doa_thread.daemon = True
        self.doa_thread.start()
        print("DOA reading thread started")
    
    def _doa_reading_loop(self):
        """Separate thread for reading DOA values"""
        while self.Mic_tuning:
            try:
                # Read DOA value
                doa_value = self.Mic_tuning.direction
                
                # Update current DOA with thread lock
                with self.doa_lock:
                    self.current_doa = doa_value
                
                # Small delay to prevent overwhelming the USB device
                time.sleep(0.1)  # 10Hz update rate
                
            except Exception as e:
                # Only print error occasionally to avoid spam
                if hasattr(self, '_doa_error_count'):
                    self._doa_error_count += 1
                else:
                    self._doa_error_count = 1
                    
                if self._doa_error_count % 100 == 1:
                    print(f"DOA reading error (count: {self._doa_error_count}): {e}")
                
                time.sleep(0.1)
    
    def _find_respeaker_audio_device(self):
        """Find ReSpeaker audio device index - Enhanced detection"""
        if not self.audio:
            return None
            
        print("Scanning for ReSpeaker audio devices...")
        for i in range(self.audio.get_device_count()):
            info = self.audio.get_device_info_by_index(i)
            device_name = info['name'].lower()
            print(f"  Device {i}: {info['name']} (channels: {info['maxInputChannels']})")
            
            # Enhanced detection patterns for ReSpeaker
            respeaker_keywords = [
                'respeaker', 
                'arrayuac10', 
                '2886:0018',
                'seeed',
                'mic array',
                'uac1.0'
            ]
            
            if any(keyword in device_name for keyword in respeaker_keywords):
                # Additional validation: check if it has enough input channels
                if info['maxInputChannels'] >= self.channels:
                    print(f"Found ReSpeaker audio device: {info['name']}")
                    return i
                else:
                    print(f"Found ReSpeaker device but insufficient channels: {info['maxInputChannels']} < {self.channels}")
        
        print("No suitable ReSpeaker audio device found")
        return None
    
    def setup_ssh_streaming(self, ssh_host, ssh_port=9999):
        """Setup SSH socket for streaming data to laptop"""
        try:
            self.ssh_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.ssh_socket.connect((ssh_host, ssh_port))
            self.ssh_connected = True
            print(f"Connected to SSH laptop at {ssh_host}:{ssh_port}")
            return True
        except Exception as e:
            print(f"Failed to connect to SSH laptop: {e}")
            self.ssh_connected = False
            return False
    
    def start_capture(self, output_dir, filename_prefix):
        """Start capturing raw audio and DOA data"""
        if not self.device_index:
            print("Error: ReSpeaker not initialized")
            return False
            
        try:
            # Setup audio stream
            self.stream = self.audio.open(
                format=self.format,
                channels=self.channels,
                rate=self.rate,
                input=True,
                input_device_index=self.device_index,
                frames_per_buffer=self.chunk_size
            )
            
            # Setup output files with user ID prefix
            self.raw_audio_file = os.path.join(output_dir, f"{filename_prefix}_respeaker_raw.wav")
            self.doa_log_file = os.path.join(output_dir, f"{filename_prefix}_doa_log.json")
            
            # Initialize data storage
            self.raw_audio_data = []
            self.doa_data = []
            self.is_capturing = True
            
            # Start capture thread
            self.capture_thread = threading.Thread(target=self._capture_loop)
            self.capture_thread.daemon = True
            self.capture_thread.start()
            
            print("ReSpeaker capture started")
            return True
            
        except Exception as e:
            print(f"Error starting ReSpeaker capture: {e}")
            return False
    
    def _capture_loop(self):
        """Main capture loop for audio and DOA data"""
        frame_count = 0
        
        while self.is_capturing:
            try:
                # Read audio data
                audio_data = self.stream.read(self.chunk_size, exception_on_overflow=False)
                timestamp = time.time()
                
                # Convert to numpy array for processing
                audio_array = np.frombuffer(audio_data, dtype=np.int16)
                audio_array = audio_array.reshape(-1, self.channels)
                
                # Store raw audio data
                self.raw_audio_data.append(audio_data)
                
                # Get current DOA from separate thread
                with self.doa_lock:
                    doa_angle = self.current_doa
                
                # Store DOA data
                doa_entry = {
                    'timestamp': timestamp,
                    'frame': frame_count,
                    'doa_angle': doa_angle,
                    'audio_level': float(np.mean(np.abs(audio_array)))  # RMS level
                }
                self.doa_data.append(doa_entry)
                
                # Stream to SSH laptop if connected
                if self.ssh_connected:
                    self._stream_to_ssh(audio_array, doa_entry)
                
                frame_count += 1
                
            except Exception as e:
                print(f"Capture loop error: {e}")
                time.sleep(0.001)  # Brief pause on error
    
    def _stream_to_ssh(self, audio_array, doa_entry):
        """Stream audio and DOA data to SSH laptop"""
        try:
            # Prepare data packet
            packet = {
                'type': 'respeaker_data',
                'timestamp': doa_entry['timestamp'],
                'doa_angle': doa_entry['doa_angle'],
                'audio_level': doa_entry['audio_level'],
                'audio_shape': audio_array.shape,
                'audio_data': audio_array.tobytes().hex()  # Convert to hex string for JSON
            }
            
            # Send as JSON
            json_data = json.dumps(packet) + '\n'
            self.ssh_socket.sendall(json_data.encode('utf-8'))
            
        except Exception as e:
            print(f"SSH streaming error: {e}")
            self.ssh_connected = False
    
    def get_current_doa(self):
        """Get current DOA reading for status updates"""
        if self.Mic_tuning and self.is_capturing:
            with self.doa_lock:
                return self.current_doa
        return None
    
    def stop_capture(self):
        """Stop capturing and save data"""
        if not self.is_capturing:
            return
            
        self.is_capturing = False
        
        # Wait for capture thread to finish
        if hasattr(self, 'capture_thread'):
            self.capture_thread.join(timeout=2)
        
        # Stop audio stream
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
            self.stream = None
        
        # Save data
        self._save_raw_audio()
        self._save_doa_log()
        
        print("ReSpeaker capture stopped and data saved")
    
    def _save_raw_audio(self):
        """Save raw audio data to WAV file"""
        if not self.raw_audio_data:
            return
            
        try:
            with wave.open(self.raw_audio_file, 'wb') as wf:
                wf.setnchannels(self.channels)
                wf.setsampwidth(self.audio.get_sample_size(self.format))
                wf.setframerate(self.rate)
                wf.writeframes(b''.join(self.raw_audio_data))
            
            file_size = os.path.getsize(self.raw_audio_file) / 1024 / 1024
            print(f"Raw audio saved: {self.raw_audio_file} ({file_size:.2f} MB)")
            
        except Exception as e:
            print(f"Error saving raw audio: {e}")
    
    def _save_doa_log(self):
        """Save DOA log to JSON file"""
        if not self.doa_data:
            return
            
        try:
            # Count non-null DOA readings
            non_null_count = sum(1 for entry in self.doa_data if entry['doa_angle'] is not None)
            
            with open(self.doa_log_file, 'w') as f:
                json.dump(self.doa_data, f, indent=2)
            
            print(f"DOA log saved: {self.doa_log_file} ({len(self.doa_data)} entries, {non_null_count} with valid DOA)")
            
        except Exception as e:
            print(f"Error saving DOA log: {e}")
    
    def cleanup(self):
        """Cleanup resources"""
        # Stop DOA thread
        if self.Mic_tuning:
            self.Mic_tuning = None
            
        if hasattr(self, 'doa_thread') and self.doa_thread:
            self.doa_thread.join(timeout=2)
            
        if self.stream:
            self.stream.close()
        if self.audio:
            self.audio.terminate()
        if self.ssh_socket:
            self.ssh_socket.close()


class VideoStreamer:
    """Handles dual USB camera video recording using ffmpeg (lightweight for Raspberry Pi)"""
    
    def __init__(self):
        self.is_streaming = False
        self.is_recording = False
        self.ffmpeg_processes = []
        self.camera_devices = []
        self.output_files = []
        
    @property
    def cameras(self):
        """Compatibility property for old code expecting 'cameras' attribute"""
        return self.camera_devices
        
    def find_cameras(self):
        """Find available USB cameras in /dev/video*"""
        print("Searching for USB cameras...")
        available_cameras = []
        
        try:
            # Use v4l2-ctl --list-devices to find cameras properly
            result = subprocess.run(
                ['v4l2-ctl', '--list-devices'],
                capture_output=True, text=True, timeout=2
            )
            
            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                current_device = None
                
                for line in lines:
                    # Check for HD USB Camera entries
                    if 'HD USB Camera' in line and 'usb-' in line:
                        current_device = 'HD USB Camera'
                        print(f"Found: {line.strip()}")
                    elif current_device == 'HD USB Camera' and line.strip().startswith('/dev/video'):
                        device = line.strip()
                        # For each camera, typically video0/video2 are the main devices
                        # and video1/video3 are metadata devices
                        if device in ['/dev/video0', '/dev/video2']:
                            available_cameras.append(device)
                            print(f"  Using main device: {device}")
                    elif line.strip() == '':
                        current_device = None
                        
                if len(available_cameras) >= 2:
                    return available_cameras[:2]
                    
            # Fallback: if v4l2-ctl fails or doesn't find both cameras
            if len(available_cameras) < 2:
                print("Fallback: checking /dev/video0 through /dev/video3")
                for i in range(4):
                    device = f'/dev/video{i}'
                    if os.path.exists(device) and device not in available_cameras:
                        try:
                            # Quick test to see if device is usable
                            test_cmd = ['v4l2-ctl', '-d', device, '--all']
                            test_result = subprocess.run(test_cmd, capture_output=True, text=True, timeout=1)
                            
                            if 'HD USB Camera' in test_result.stdout or i in [0, 2]:
                                available_cameras.append(device)
                                print(f"  Added: {device}")
                                
                                if len(available_cameras) >= 2:
                                    break
                        except:
                            pass
                            
        except Exception as e:
            print(f"Error during camera detection: {e}")
            # Ultimate fallback
            print("Using default devices /dev/video0 and /dev/video2")
            available_cameras = ['/dev/video0', '/dev/video2']
        
        print(f"Selected cameras: {available_cameras}")
        return available_cameras
    
    def initialize_cameras(self):
        """Initialize cameras - just find and store device paths"""
        self.camera_devices = self.find_cameras()
        
        if len(self.camera_devices) < 2:
            print(f"Warning: Only {len(self.camera_devices)} camera(s) found, expected 2")
        
        return len(self.camera_devices) > 0
    
    def start_recording(self, output_dir, filename_prefix):
        """Start recording video from both cameras using ffmpeg"""
        if self.is_recording:
            return False
        
        if not self.camera_devices:
            print("No cameras initialized")
            return False
        
        self.ffmpeg_processes = []
        self.output_files = []
        
        for i, device in enumerate(self.camera_devices):
            output_file = os.path.join(output_dir, f"{filename_prefix}_camera{i+1}.mp4")
            self.output_files.append(output_file)
            
            # First try with MJPEG input format
            ffmpeg_cmd = [
                'ffmpeg',
                '-f', 'v4l2',                    # Video4Linux2 input
                '-input_format', 'mjpeg',         # MJPEG input format
                '-framerate', '30',               # 30 fps
                '-video_size', '1024x768',        # Resolution
                '-i', device,                     # Input device
                '-c:v', 'copy',                   # Just copy MJPEG stream
                '-y',                             # Overwrite output file
                output_file
            ]
            
            try:
                # Start ffmpeg process
                process = subprocess.Popen(
                    ffmpeg_cmd,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.DEVNULL,  # Discard stdout to prevent blocking
                    stderr=subprocess.DEVNULL   # Discard stderr to prevent blocking
                )
                
                # Check if process started successfully
                time.sleep(0.5)
                if process.poll() is None:
                    self.ffmpeg_processes.append(process)
                    print(f"Started recording camera {i+1} ({device}) to {output_file}")
                else:
                    raise Exception("FFmpeg process died immediately")
                
            except Exception as e:
                print(f"Failed with MJPEG format, trying YUYV: {e}")
                
                # Try with YUYV format
                ffmpeg_cmd[4] = 'yuyv422'  # Change input format
                ffmpeg_cmd[8] = '640x480'  # Lower resolution for YUYV
                ffmpeg_cmd[6] = '9'        # 9 fps for YUYV as per spec
                
                try:
                    process = subprocess.Popen(
                        ffmpeg_cmd,
                        stdin=subprocess.PIPE,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL
                    )
                    
                    time.sleep(0.5)
                    if process.poll() is None:
                        self.ffmpeg_processes.append(process)
                        print(f"Started recording camera {i+1} with YUYV format")
                    else:
                        raise Exception("FFmpeg process died immediately")
                        
                except Exception as e2:
                    print(f"Failed with hardware encoding, trying software: {e2}")
                    
                    # Try software encoding
                    ffmpeg_cmd[10] = 'libx264'  # Change to software encoder
                    
                    try:
                        process = subprocess.Popen(
                            ffmpeg_cmd,
                            stdin=subprocess.PIPE,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE  # Keep stderr for debugging
                        )
                        
                        time.sleep(0.5)
                        if process.poll() is None:
                            self.ffmpeg_processes.append(process)
                            print(f"Started recording camera {i+1} with software encoding")
                        else:
                            # Print stderr for debugging
                            stderr_output = process.stderr.read().decode('utf-8')
                            print(f"FFmpeg error: {stderr_output}")
                            
                    except Exception as e3:
                        print(f"Failed completely for camera {i+1}: {e3}")
        
        self.is_recording = len(self.ffmpeg_processes) > 0
        
        # Start monitoring thread
        if self.is_recording:
            self.monitor_thread = threading.Thread(target=self._monitor_recording)
            self.monitor_thread.daemon = True
            self.monitor_thread.start()
        
        return self.is_recording
    
    def _monitor_recording(self):
        """Monitor ffmpeg processes in background"""
        time.sleep(3)  # Initial delay
        
        while self.is_recording:
            for i, process in enumerate(self.ffmpeg_processes):
                if process and process.poll() is not None:
                    # Process terminated
                    stderr_output = process.stderr.read().decode('utf-8')
                    if stderr_output:
                        print(f"\nCamera {i+1} ffmpeg error (exit code {process.returncode}):")
                        print(stderr_output[-500:])  # Last 500 chars
            
            time.sleep(5)  # Check every 5 seconds
    
    def start_streaming(self, ssh_host, base_port=8888):
        """Start streaming video to SSH laptop using ffmpeg"""
        if self.is_streaming:
            return False
        
        if not self.camera_devices:
            print("No cameras initialized")
            return False
        
        # For streaming, we'll use ffmpeg to stream directly
        # This is much more efficient than processing frames in Python
        for i, device in enumerate(self.camera_devices):
            stream_port = base_port + i
            
            # FFmpeg streaming command
            ffmpeg_stream_cmd = [
                'ffmpeg',
                '-f', 'v4l2',
                '-input_format', 'mjpeg',
                '-framerate', '15',              # Lower framerate for streaming
                '-video_size', '512x384',        # Lower resolution for streaming
                '-i', device,
                '-c:v', 'mjpeg',                 # Keep MJPEG for low latency
                '-q:v', '5',                     # Quality setting
                '-f', 'mjpeg',                   # Output format
                f'tcp://{ssh_host}:{stream_port}'
            ]
            
            try:
                # Start streaming process in background
                process = subprocess.Popen(
                    ffmpeg_stream_cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                print(f"Camera {i+1} streaming to {ssh_host}:{stream_port}")
                
            except Exception as e:
                print(f"Failed to start streaming camera {i+1}: {e}")
        
        self.is_streaming = True
        return True
    
    def stop_recording(self):
        """Stop recording video"""
        if not self.is_recording:
            return
        
        self.is_recording = False
        
        # Stop all ffmpeg processes gracefully
        for i, process in enumerate(self.ffmpeg_processes):
            if process and process.poll() is None:  # Process is still running
                try:
                    process.terminate()
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    print(f"Camera {i+1} ffmpeg process didn't terminate gracefully, killing it")
                    process.kill()
                    process.wait()
                
                # Check if there were any errors
                if hasattr(process, 'stderr') and process.stderr:
                    try:
                        stderr_output = process.stderr.read().decode('utf-8')
                        if stderr_output:
                            print(f"Camera {i+1} ffmpeg errors:\n{stderr_output[-500:]}")
                    except:
                        pass
        
        self.ffmpeg_processes = []
        
        # Report file sizes
        for output_file in self.output_files:
            if os.path.exists(output_file):
                size_mb = os.path.getsize(output_file) / 1024 / 1024
                print(f"Video saved: {output_file} ({size_mb:.2f} MB)")
        
        print("Video recording stopped")
    
    def stop_streaming(self):
        """Stop video streaming"""
        # For now, streaming is handled by separate ffmpeg processes
        # In production, you'd want to track and stop these processes
        self.is_streaming = False
        print("Video streaming stopped")
    
    def cleanup(self):
        """Cleanup all resources"""
        self.stop_recording()
        self.stop_streaming()
        self.camera_devices = []
        self.output_files = []


class RecordingControl_v3:
    """Enhanced recording control that integrates with Flask web interface"""
    
    def __init__(self, ssh_host="172.20.10.4"):
        self.recording_dir = "/home/robff/robff/recordings"
        self.is_recording = False
        self.ssh_host = ssh_host  # Permanently set to laptop IP
        self.user_id = "default"  # Default user ID
        
        # ReSpeaker controller
        self.respeaker = ReSpeakerController()
        
        # Video streamer
        self.video_streamer = VideoStreamer()
        
        # Create recording directory if it doesn't exist
        os.makedirs(self.recording_dir, exist_ok=True)
        
        # Initialize ReSpeaker
        if RESPEAKER_AVAILABLE:
            if self.respeaker.initialize():
                print("ReSpeaker initialized successfully")
                if self.ssh_host:
                    self.respeaker.setup_ssh_streaming(self.ssh_host, ssh_port=9999)
            else:
                print("Failed to initialize ReSpeaker")
        else:
            print("ReSpeaker not available, continuing without spatial audio")
        
        # Initialize cameras
        try:
            if self.video_streamer.initialize_cameras():
                print("Cameras initialized successfully")
            else:
                print("Failed to initialize cameras")
        except Exception as e:
            print(f"Error initializing cameras: {e}")
    
    def set_user_id(self, user_id):
        """Set user ID for file naming"""
        if user_id and user_id.strip():
            # Sanitize user ID for filename usage
            self.user_id = "".join(c for c in user_id.strip() if c.isalnum() or c in ('-', '_'))
            return True
        return False
    
    def start_recording(self):
        if self.is_recording:
            return False
            
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename_prefix = f"{self.user_id}_{timestamp}"
        
        try:
            print(f"Starting recording session: {timestamp}")
            
            # Start ReSpeaker capture
            if RESPEAKER_AVAILABLE and self.respeaker.device_index:
                self.respeaker.start_capture(self.recording_dir, filename_prefix)
            
            # Start video recording
            self.video_streamer.start_recording(self.recording_dir, filename_prefix)
            
            # Start video streaming if SSH host is configured
            if self.ssh_host:
                self.video_streamer.start_streaming(self.ssh_host, base_port=8888)
            
            self.is_recording = True
            self.start_time = time.time()
            
            print(f"Recording session started:")
            if RESPEAKER_AVAILABLE and self.respeaker.device_index:
                print(f"  ReSpeaker raw: {self.respeaker.raw_audio_file}")
                print(f"  DOA log: {self.respeaker.doa_log_file}")
            print(f"  Video: {len(self.video_streamer.cameras)} camera(s) recording")
            if self.ssh_host:
                print(f"  Audio streaming to: {self.ssh_host}:9999")
                print(f"  Video streaming to: {self.ssh_host}:8888-8889")
            
            return True
            
        except Exception as e:
            print(f"Failed to start recording: {e}")
            self.stop_recording()
            return False
    
    def stop_recording(self):
        if not self.is_recording:
            return False
            
        try:
            print("Stopping recording session...")
            
            # Stop video recording and streaming
            self.video_streamer.stop_recording()
            self.video_streamer.stop_streaming()
            
            # Stop ReSpeaker capture
            if RESPEAKER_AVAILABLE:
                self.respeaker.stop_capture()
            
            self.is_recording = False
            
            duration = time.time() - self.start_time
            print(f"Recording session stopped. Duration: {duration:.2f} seconds")
            
            return True
                
        except Exception as e:
            print(f"Error stopping recording: {e}")
            return False
    
    def get_recording_status(self):
        """Get current recording status for web interface"""
        status = {
            'is_recording': self.is_recording,
            'respeaker_available': RESPEAKER_AVAILABLE,
            'respeaker_initialized': self.respeaker.device_index is not None if RESPEAKER_AVAILABLE else False,
            'ssh_connected': self.respeaker.ssh_connected if RESPEAKER_AVAILABLE else False,
            'video_streaming': self.video_streamer.is_streaming,
            'cameras_active': len(self.video_streamer.camera_devices),
            'laptop_ip': self.ssh_host,
            'user_id': self.user_id
        }
        
        if self.is_recording:
            status['duration'] = time.time() - self.start_time
            
            # Get current DOA if available
            if RESPEAKER_AVAILABLE and self.respeaker.Mic_tuning:
                status['current_doa'] = self.respeaker.get_current_doa()
        
        return status
    
    def cleanup(self):
        """Cleanup all resources"""
        if self.is_recording:
            self.stop_recording()
        
        if RESPEAKER_AVAILABLE:
            self.respeaker.cleanup()
        
        self.video_streamer.cleanup()


# For backward compatibility with existing Flask interface
RecordingControl_v2 = RecordingControl_v3
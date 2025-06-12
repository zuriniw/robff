#!/usr/bin/env python3
"""
Debug script to test ReSpeaker audio streaming step by step
Run this on the Pi to diagnose the audio streaming issue
"""

import pyaudio
import numpy as np
import socket
import json
import time
import threading

def test_audio_devices():
    """Test audio device detection"""
    print("=== Audio Device Detection ===")
    
    try:
        audio = pyaudio.PyAudio()
        device_count = audio.get_device_count()
        print(f"Total audio devices: {device_count}")
        
        respeaker_devices = []
        
        for i in range(device_count):
            try:
                info = audio.get_device_info_by_index(i)
                device_name = info['name'].lower()
                
                print(f"Device {i:2d}: {info['name']}")
                print(f"          Inputs: {info['maxInputChannels']}")
                print(f"          Rate: {info['defaultSampleRate']}")
                
                # Check for ReSpeaker keywords
                keywords = ['respeaker', 'arrayuac10', '2886:0018', 'seeed', 'mic array', 'uac1.0']
                if any(keyword in device_name for keyword in keywords):
                    print(f"          *** RESPEAKER CANDIDATE ***")
                    if info['maxInputChannels'] >= 6:
                        respeaker_devices.append(i)
                        print(f"          ✅ SUITABLE (6+ channels)")
                    else:
                        print(f"          ❌ NOT SUITABLE ({info['maxInputChannels']} < 6 channels)")
                print()
                
            except Exception as e:
                print(f"Device {i:2d}: Error - {e}")
                print()
        
        audio.terminate()
        return respeaker_devices
        
    except Exception as e:
        print(f"PyAudio error: {e}")
        return []

def test_audio_capture(device_index):
    """Test basic audio capture from specified device"""
    print(f"=== Testing Audio Capture (Device {device_index}) ===")
    
    try:
        audio = pyaudio.PyAudio()
        
        # Test parameters matching your code
        format = pyaudio.paInt16
        channels = 6
        rate = 16000
        chunk_size = 1024
        
        print(f"Opening stream...")
        print(f"  Device: {device_index}")
        print(f"  Channels: {channels}")
        print(f"  Rate: {rate}")
        print(f"  Chunk: {chunk_size}")
        
        stream = audio.open(
            format=format,
            channels=channels,
            rate=rate,
            input=True,
            input_device_index=device_index,
            frames_per_buffer=chunk_size
        )
        
        print("✅ Stream opened successfully!")
        print("Testing audio capture for 5 seconds...")
        
        audio_levels = []
        
        for i in range(5):
            try:
                # Read audio data
                audio_data = stream.read(chunk_size, exception_on_overflow=False)
                
                # Convert to numpy array
                audio_array = np.frombuffer(audio_data, dtype=np.int16)
                audio_array = audio_array.reshape(-1, channels)
                
                # Calculate audio level
                audio_level = float(np.mean(np.abs(audio_array)))
                audio_levels.append(audio_level)
                
                print(f"  Second {i+1}: Level = {audio_level:.2f}, Data size = {len(audio_data)} bytes")
                time.sleep(1)
                
            except Exception as e:
                print(f"  Second {i+1}: Read error - {e}")
        
        stream.stop_stream()
        stream.close()
        audio.terminate()
        
        if audio_levels:
            avg_level = sum(audio_levels) / len(audio_levels)
            max_level = max(audio_levels)
            print(f"✅ Audio capture successful!")
            print(f"   Average level: {avg_level:.2f}")
            print(f"   Peak level: {max_level:.2f}")
            return True
        else:
            print("❌ No audio data captured")
            return False
            
    except Exception as e:
        print(f"❌ Audio capture failed: {e}")
        return False

def test_socket_connection(host="172.20.10.4", port=9999):
    """Test socket connection to laptop"""
    print(f"=== Testing Socket Connection ===")
    print(f"Connecting to {host}:{port}...")
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)  # 10 second timeout
        sock.connect((host, port))
        
        print("✅ Socket connection successful!")
        
        # Test sending data
        test_packet = {
            'type': 'test_data',
            'timestamp': time.time(),
            'message': 'Hello from Pi'
        }
        
        json_data = json.dumps(test_packet) + '\n'
        sock.sendall(json_data.encode('utf-8'))
        print("✅ Test data sent successfully!")
        
        sock.close()
        return True
        
    except Exception as e:
        print(f"❌ Socket connection failed: {e}")
        return False

def test_full_streaming(device_index, host="172.20.10.4", port=9999):
    """Test full audio streaming pipeline"""
    print(f"=== Testing Full Audio Streaming ===")
    
    try:
        # Setup audio
        audio = pyaudio.PyAudio()
        stream = audio.open(
            format=pyaudio.paInt16,
            channels=6,
            rate=16000,
            input=True,
            input_device_index=device_index,
            frames_per_buffer=1024
        )
        
        # Setup socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((host, port))
        
        print("✅ Audio and socket ready!")
        print("Streaming for 10 seconds...")
        
        frame_count = 0
        start_time = time.time()
        
        while time.time() - start_time < 10:
            try:
                # Read audio
                audio_data = stream.read(1024, exception_on_overflow=False)
                audio_array = np.frombuffer(audio_data, dtype=np.int16)
                audio_array = audio_array.reshape(-1, 6)
                
                # Create packet (similar to your code)
                packet = {
                    'type': 'respeaker_data',
                    'timestamp': time.time(),
                    'doa_angle': None,  # Skip DOA for this test
                    'audio_level': float(np.mean(np.abs(audio_array))),
                    'audio_shape': audio_array.shape,
                    'audio_data': audio_array.tobytes().hex()
                }
                
                # Send packet
                json_data = json.dumps(packet) + '\n'
                sock.sendall(json_data.encode('utf-8'))
                
                frame_count += 1
                
                if frame_count % 16 == 0:  # Print every ~1 second
                    print(f"  Sent {frame_count} frames, audio level: {packet['audio_level']:.2f}")
                
            except Exception as e:
                print(f"  Streaming error: {e}")
                break
        
        stream.stop_stream()
        stream.close()
        audio.terminate()
        sock.close()
        
        print(f"✅ Streaming test complete! Sent {frame_count} frames")
        return True
        
    except Exception as e:
        print(f"❌ Streaming test failed: {e}")
        return False

def main():
    print("🔍 ReSpeaker Audio Streaming Debug")
    print("=" * 50)
    
    # Step 1: Find audio devices
    print("Step 1: Finding ReSpeaker devices...")
    devices = test_audio_devices()
    
    if not devices:
        print("❌ No suitable ReSpeaker devices found!")
        print("Check USB connection and drivers")
        return
    
    print(f"✅ Found {len(devices)} ReSpeaker device(s): {devices}")
    device_index = devices[0]
    
    # Step 2: Test audio capture
    print(f"\nStep 2: Testing audio capture...")
    if not test_audio_capture(device_index):
        print("❌ Audio capture failed!")
        return
    
    # Step 3: Test socket connection
    print(f"\nStep 3: Testing socket connection...")
    if not test_socket_connection():
        print("❌ Socket connection failed!")
        print("Make sure your laptop receiver is running!")
        return
    
    # Step 4: Test full streaming
    print(f"\nStep 4: Testing full streaming...")
    print("Make sure your laptop receiver is running!")
    input("Press Enter when ready...")
    
    if test_full_streaming(device_index):
        print("\n🎉 All tests passed! Audio streaming should work.")
        print("If your main app still fails, the issue is in the Flask/recording code.")
    else:
        print("\n❌ Streaming test failed.")

if __name__ == "__main__":
    main()
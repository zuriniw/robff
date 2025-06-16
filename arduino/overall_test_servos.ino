#include <Servo.h>

Servo liftServo;    // Pin 21, max-1506-down, min-1000-up, mid-1550-mid
Servo tiltServo;    // Pin 22, max-1890-up, min-1515-down, mid-1500-flat
Servo gripperServo; // Pin 11, max-2330-close, min-500-open, mid-1440-semiopen

bool servosAttached = true;

void setup() {
  Serial.begin(9600);
  
  liftServo.attach(21);
  tiltServo.attach(22);
  gripperServo.attach(11);
  
  Serial.println("All Servos Test - Commands:");
  Serial.println("home = Home position (mid, flat, open)");
  Serial.println("hold = Hold position (mid, flat, close)");
  Serial.println("lift = Lift position (up, up, close)");
  Serial.println("grip = Grip position (down, down, close)");
  Serial.println("capture = Capture position (down, down, open)");
  Serial.println("stop = stop/detach all");
  Serial.println("attach = attach/enable all");
}

void loop() {
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toLowerCase();
    
    if (cmd == "home" && servosAttached) {
      Serial.println("Moving to HOME position...");
      liftServo.writeMicroseconds(1550);   // mid
      tiltServo.writeMicroseconds(1500);   // flat
      gripperServo.writeMicroseconds(500); // open
    }
    else if (cmd == "hold" && servosAttached) {
      Serial.println("Moving to HOLD position...");
      liftServo.writeMicroseconds(1550);   // mid
      tiltServo.writeMicroseconds(1500);   // flat
      gripperServo.writeMicroseconds(2330); // close
    }
    else if (cmd == "lift" && servosAttached) {
      Serial.println("Moving to LIFT position...");
      liftServo.writeMicroseconds(1000);   // up
      tiltServo.writeMicroseconds(1890);   // up
      gripperServo.writeMicroseconds(2330); // close
    }
    else if (cmd == "grip" && servosAttached) {
      Serial.println("Moving to GRIP position...");
      liftServo.writeMicroseconds(1900);   // down
      tiltServo.writeMicroseconds(1515);   // down
      gripperServo.writeMicroseconds(2330); // close
    }
    else if (cmd == "capture" && servosAttached) {
      Serial.println("Moving to CAPTURE position...");
      liftServo.writeMicroseconds(1506);   // down
      tiltServo.writeMicroseconds(1515);   // down
      gripperServo.writeMicroseconds(500); // open
    }
    else if (cmd == "stop") {
      Serial.println("Stopping all servos...");
      liftServo.detach();
      tiltServo.detach();
      gripperServo.detach();
      servosAttached = false;
    }
    else if (cmd == "attach") {
      Serial.println("Attaching all servos...");
      liftServo.attach(21);
      tiltServo.attach(22);
      gripperServo.attach(11);
      servosAttached = true;
    }
    else if (!servosAttached) {
      Serial.println("Servos detached! Type 'attach' to enable first.");
    }
    else {
      Serial.println("Unknown command! Available: home, hold, lift, grip, capture, stop, attach");
    }
  }
}
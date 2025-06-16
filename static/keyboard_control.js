// Copyright Pololu Corporation.  For more information, see https://www.pololu.com/
// ============================================================================
// KEYBOARD MOVEMENT CONTROLS
// ============================================================================

/**
 * Keyboard movement control module for robot car
 * Handles WASD key bindings for forward/backward/left/right movement
 */

class KeyboardControls {
  constructor() {
    // Keyboard control state
    this.keys_pressed = {
      w: false,
      a: false,
      s: false,
      d: false,
      q: false,  // lift up
      e: false,  // lift down
      r: false,  // tilt up
      t: false,  // tilt down
      z: false,  // gripper close
      c: false   // gripper open
    }
    
    // Movement parameters
    this.base_strength = 200  // Base motor strength for keyboard controls
    this.rotation_factor = 0.6  // Factor for rotation strength relative to forward/backward
    
    // Servo control parameters
    this.servo_step = 180  // PWM step size for servo adjustments
    this.servo_update_interval = 100  // Milliseconds between servo updates
    this.last_servo_update = 0
    this.servo_timer = null  // Timer for continuous servo updates
    
    // PWM ranges for each servo
    this.pwm_ranges = {
      lift: { min: 1000, max: 1506, mid: 1350 },
      tilt: { min: 1515, max: 1900, mid: 1700 },
      gripper: { min: 500, max: 2400, mid: 1440 }
    }
    
    // External dependencies (to be injected)
    this.setMotors = null
    this.isSystemPaused = null
    this.stopMovement = null
    this.setServoPWM = null
    this.updateSliderValue = null
    
    this.initialized = false
  }
  
  /**
   * Initialize keyboard controls with required dependencies
   * @param {Object} dependencies - Required external functions
   * @param {Function} dependencies.setMotors - Function to set motor speeds (left, right)
   * @param {Function} dependencies.isSystemPaused - Function that returns pause state
   * @param {Function} dependencies.stopMovement - Function to stop all movement
   * @param {Function} dependencies.setServoPWM - Function to set servo PWM (servo, value)
   * @param {Function} dependencies.updateSliderValue - Function to update slider display (servo, value)
   */
  init(dependencies) {
    if (!dependencies.setMotors || !dependencies.isSystemPaused || !dependencies.stopMovement ||
        !dependencies.setServoPWM || !dependencies.updateSliderValue) {
      console.error('KeyboardControls: Missing required dependencies')
      return false
    }
    
    this.setMotors = dependencies.setMotors
    this.isSystemPaused = dependencies.isSystemPaused
    this.stopMovement = dependencies.stopMovement
    this.setServoPWM = dependencies.setServoPWM
    this.updateSliderValue = dependencies.updateSliderValue
    
    this.bindEvents()
    this.initialized = true
    
    console.log('KeyboardControls: Initialized successfully with servo control')
    return true
  }
  
  /**
   * Bind keyboard event listeners
   */
  bindEvents() {
    $(document).on("keydown", (e) => this.handleKeyDown(e))
    $(document).on("keyup", (e) => this.handleKeyUp(e))
  }
  
  /**
   * Handle keydown events
   * @param {Event} e - Keyboard event
   */
  handleKeyDown(e) {
    // Skip keyboard controls if user is typing in an input field
    if ($(e.target).is('input, textarea, select')) {
      return
    }
    
    const key = e.key.toLowerCase()
    if (key in this.keys_pressed && !this.keys_pressed[key]) {
      this.keys_pressed[key] = true
      
      if (!this.isSystemPaused()) {
        // Handle movement keys
        if (['w', 'a', 's', 'd'].includes(key)) {
          this.updateMovementFromKeys()
        }
        // Handle servo keys - start continuous updates
        else if (['q', 'e', 'r', 't', 'z', 'c'].includes(key)) {
          this.startContinuousServoUpdates()
        }
      }
      e.preventDefault()
    }
  }
  
  /**
   * Handle keyup events
   * @param {Event} e - Keyboard event
   */
  handleKeyUp(e) {
    // Skip keyboard controls if user is typing in an input field
    if ($(e.target).is('input, textarea, select')) {
      return
    }
    
    const key = e.key.toLowerCase()
    if (key in this.keys_pressed && this.keys_pressed[key]) {
      this.keys_pressed[key] = false
      
      // Handle movement keys
      if (['w', 'a', 's', 'd'].includes(key)) {
        this.updateMovementFromKeys()
      }
      // Handle servo keys - check if we should stop continuous updates
      else if (['q', 'e', 'r', 't', 'z', 'c'].includes(key)) {
        this.checkContinuousServoUpdates()
      }
      
      e.preventDefault()
    }
  }
  
  /**
   * Update motor movement based on currently pressed keys
   */
  updateMovementFromKeys() {
    if (!this.initialized) {
      console.warn('KeyboardControls: Not initialized')
      return
    }
    
    const forward = this.keys_pressed.w
    const backward = this.keys_pressed.s
    const left = this.keys_pressed.a
    const right = this.keys_pressed.d
    
    // Check if any movement key is pressed
    if (!forward && !backward && !left && !right) {
      this.stopMovement()
      return
    }
    
    // If paused, stop movement
    if (this.isSystemPaused()) {
      this.stopMovement()
      return
    }
    
    // Calculate motor values
    const motorSpeeds = this.calculateMotorSpeeds(forward, backward, left, right)
    this.setMotors(motorSpeeds.left, motorSpeeds.right)
  }
  
  /**
   * Start continuous servo updates when servo keys are pressed
   */
  startContinuousServoUpdates() {
    if (!this.initialized) {
      console.warn('KeyboardControls: Not initialized')
      return
    }
    
    // If timer is already running, don't start another one
    if (this.servo_timer) {
      return
    }
    
    // Start immediate update
    this.updateServoFromKeys()
    
    // Start continuous updates
    this.servo_timer = setInterval(() => {
      if (this.isSystemPaused()) {
        this.stopContinuousServoUpdates()
        return
      }
      
      // Check if any servo keys are still pressed
      const servoKeysPressed = ['q', 'e', 'r', 't', 'z', 'c'].some(key => this.keys_pressed[key])
      
      if (servoKeysPressed) {
        this.updateServoFromKeys()
      } else {
        // No servo keys pressed, stop the timer
        this.stopContinuousServoUpdates()
      }
    }, this.servo_update_interval)
  }
  
  /**
   * Stop continuous servo updates
   */
  stopContinuousServoUpdates() {
    if (this.servo_timer) {
      clearInterval(this.servo_timer)
      this.servo_timer = null
    }
  }
  
  /**
   * Check if continuous servo updates should continue
   */
  checkContinuousServoUpdates() {
    // Check if any servo keys are still pressed
    const servoKeysPressed = ['q', 'e', 'r', 't', 'z', 'c'].some(key => this.keys_pressed[key])
    
    if (!servoKeysPressed) {
      // No servo keys pressed, stop continuous updates
      this.stopContinuousServoUpdates()
    }
  }
  /**
   * Update servo positions based on currently pressed keys
   */
  updateServoFromKeys() {
    if (!this.initialized) {
      console.warn('KeyboardControls: Not initialized')
      return
    }
    
    // If paused, don't update servos
    if (this.isSystemPaused()) {
      return
    }
    
    // Get current slider values
    const liftSlider = document.getElementById('liftSlider')
    const tiltSlider = document.getElementById('tiltSlider')
    const gripperSlider = document.getElementById('gripperSlider')
    
    if (!liftSlider || !tiltSlider || !gripperSlider) {
      console.warn('KeyboardControls: Slider elements not found')
      return
    }
    
    // Handle lift control (Q/E keys)
    if (this.keys_pressed.q || this.keys_pressed.e) {
      let currentLift = parseInt(liftSlider.value)
      const range = this.pwm_ranges.lift
      
      if (this.keys_pressed.q) {
        // Q key: increase lift value (lift up)
        currentLift = Math.min(range.max, currentLift + this.servo_step)
      } else if (this.keys_pressed.e) {
        // E key: decrease lift value (lift down)
        currentLift = Math.max(range.min, currentLift - this.servo_step)
      }
      
      // Update slider and servo
      liftSlider.value = currentLift
      this.updateSliderValue('lift', currentLift)
      this.setServoPWM('lift', currentLift)
    }
    
    // Handle tilt control (R/T keys)
    if (this.keys_pressed.r || this.keys_pressed.t) {
      let currentTilt = parseInt(tiltSlider.value)
      const range = this.pwm_ranges.tilt
      
      if (this.keys_pressed.r) {
        // R key: increase tilt value (tilt up/back)
        currentTilt = Math.min(range.max, currentTilt + this.servo_step)
      } else if (this.keys_pressed.t) {
        // T key: decrease tilt value (tilt down/forward)
        currentTilt = Math.max(range.min, currentTilt - this.servo_step)
      }
      
      // Update slider and servo
      tiltSlider.value = currentTilt
      this.updateSliderValue('tilt', currentTilt)
      this.setServoPWM('tilt', currentTilt)
    }
    
    // Handle gripper control (Z/C keys)
    if (this.keys_pressed.z || this.keys_pressed.c) {
      let currentGripper = parseInt(gripperSlider.value)
      const range = this.pwm_ranges.gripper
      
      if (this.keys_pressed.z) {
        // Z key: decrease gripper value (close gripper)
        currentGripper = Math.max(range.min, currentGripper - this.servo_step)
      } else if (this.keys_pressed.c) {
        // C key: increase gripper value (open gripper)
        currentGripper = Math.min(range.max, currentGripper + this.servo_step)
      }
      
      // Update slider and servo
      gripperSlider.value = currentGripper
      this.updateSliderValue('gripper', currentGripper)
      this.setServoPWM('gripper', currentGripper)
    }
  }
  calculateMotorSpeeds(forward, backward, left, right) {
    let left_motor = 0
    let right_motor = 0
    
    // Forward/backward movement
    if (forward && !backward) {
      left_motor += this.base_strength
      right_motor += this.base_strength
    } else if (backward && !forward) {
      left_motor -= this.base_strength
      right_motor -= this.base_strength
    }
    
    // Left/right rotation (can combine with forward/backward)
    if (left && !right) {
      left_motor -= this.base_strength * this.rotation_factor
      right_motor += this.base_strength * this.rotation_factor
    } else if (right && !left) {
      left_motor += this.base_strength * this.rotation_factor
      right_motor -= this.base_strength * this.rotation_factor
    }
    
    // Limit motor values to valid range
    left_motor = Math.max(-200, Math.min(200, left_motor))
    right_motor = Math.max(-200, Math.min(200, right_motor))
    
    return {
      left: Math.round(left_motor),
      right: Math.round(right_motor)
    }
  }
  
  /**
   * Calculate motor speeds based on key states
   * @param {boolean} forward - W key pressed
   * @param {boolean} backward - S key pressed
   * @param {boolean} left - A key pressed
   * @param {boolean} right - D key pressed
   * @returns {Object} Motor speeds {left, right}
   */
  getKeyStates() {
    return { ...this.keys_pressed }
  }
  
  /**
   * Set movement and servo parameters
   * @param {Object} params - Parameters
   * @param {number} params.baseStrength - Base motor strength
   * @param {number} params.rotationFactor - Rotation strength factor
   * @param {number} params.servoStep - PWM step size for servo adjustments
   * @param {number} params.servoUpdateInterval - Milliseconds between servo updates
   */
  setParameters(params) {
    if (params.baseStrength !== undefined) {
      this.base_strength = params.baseStrength
    }
    if (params.rotationFactor !== undefined) {
      this.rotation_factor = params.rotationFactor
    }
    if (params.servoStep !== undefined) {
      this.servo_step = params.servoStep
    }
    if (params.servoUpdateInterval !== undefined) {
      this.servo_update_interval = params.servoUpdateInterval
    }
  }
  
  /**
   * Emergency stop - immediately stop all movement and reset keys
   */
  emergencyStop() {
    // Stop continuous servo updates
    this.stopContinuousServoUpdates()
    
    // Reset all key states
    Object.keys(this.keys_pressed).forEach(key => {
      this.keys_pressed[key] = false
    })
    
    // Stop movement
    if (this.stopMovement) {
      this.stopMovement()
    }
  }
  
  /**
   * Cleanup - remove event listeners and stop timers
   */
  destroy() {
    // Stop continuous servo updates
    this.stopContinuousServoUpdates()
    
    // Remove event listeners
    $(document).off("keydown keyup")
    this.initialized = false
    console.log('KeyboardControls: Destroyed')
  }
}

// Export for use in other modules
window.KeyboardControls = KeyboardControls
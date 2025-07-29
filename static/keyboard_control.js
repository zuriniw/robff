// Copyright Pololu Corporation.  For more information, see https://www.pololu.com/
// ============================================================================
// KEYBOARD MOVEMENT CONTROLS - COMPLETE VERSION WITH COMPOSITE MOVEMENT
// ============================================================================

/**
 * Keyboard movement control module for robot car
 * Handles WASD key bindings for forward/backward/left/right movement
 * Speed switching with [/] keys
 * Updated with servo control mappings and presets
 * Added spacebar pause toggle functionality
 * Enhanced with composite movement support (W+A, W+D, S+A, S+D)
 * Added T key for 4-second countdown timer
 */

class KeyboardControls {
  constructor() {
    this.keys_pressed = {
      w: false,
      a: false,
      s: false,
      d: false,
      t: false,           // 11秒倒计时
      i: false,           // lift up
      k: false,           // lift down 
      ArrowUp: false,     // tilt up 
      ArrowDown: false,   // tilt down 
      '1': false,         // preset 1
      '2': false,         // preset 2
      '3': false,         // preset 3
      '4': false,         // preset 4
      '5': false,         // preset 5
      '6': false,         // preset 6
      '7': false,         // preset 7
      '8': false,         // preset 8
      '9': false,         // preset 9
      '0': false,         // preset 0
      'g': false,         // gesture sequence
      'j': false,         // lift middle 
      'n': false,         // lift lowest 
      'u': false,         // tilt highest 
      'h': false,         // tilt middle 
      'b': false,         // tilt lowest
      '-': false,         // close gripper 
      '=': false          // open gripper
    }
    
    // Movement parameters (保持原始值)
    this.base_strength = 300  // Base motor strength for keyboard controls
    this.rotation_factor = 0.6  // Factor for rotation strength relative to forward/backward
    
    // Speed switching - matches robot_button.py speed levels
    this.speed_levels = ["slow", "moderate", "fast"]
    this.current_speed_index = 1  // Start with "moderate" (index 1)
    
    // Servo control parameters (保持原值)
    this.servo_step = 20  // PWM step size for servo adjustments
    this.servo_update_interval = 100  // Milliseconds between servo updates
    this.last_servo_update = 0
    this.servo_timer = null  // Timer for continuous servo updates
    
    // Timer for countdown
    this.countdownInterval = null
    
    // PWM ranges for each servo (完全保留原值)
    this.pwm_ranges = {
      lift: { min: 960, max: 1630, mid: 1350 },
      tilt: { min: 1210, max: 1900, mid: 1500 },
      gripper: { min: 500, max: 2330, mid: 1440 }
    }
    
    // Preset actions configuration (完全保留原配置)
    this.presets = {
      '1': { name: 'ready to drag the box', type: 'simple', lift: 1273, tilt: 1888, gripper: 1754 },
      '2': { name: 'drag the box', type: 'simple', lift: 1530, tilt: 1580, gripper: 1000 },
      '3': { name: 'Quick Press Key', type: 'sequence', sequence: [
        { delay: 0, lift: 1150, tilt: 1510, gripper: 2330 },
        { delay: 500, lift: 1630, tilt: 1515, gripper: null },
        { delay: 1000, lift: 1350, tilt: 1510, gripper: null },
        { delay: 1500, lift: 1630, tilt: 1515, gripper: null },
        { delay: 2000, lift: 1350, tilt: 1510, gripper: null },
      ]},
      '4': { name: 'ready to press', type: 'simple', lift: 1160, tilt: 1310, gripper: 2330 },
      '5': { name: 'press down', type: 'simple', lift: 1630, tilt: 1310, gripper: 2230 },
      '6': { name: 'ready to capture badminton', type: 'simple', lift: 1630, tilt: 1890, gripper: 500 },
      '7': { name: 'Locate The Capture', type: 'simple', lift: 1200, tilt: 1600, gripper: 500 },
      '8': { name: 'press intense', type: 'simple', lift: 1630, tilt: 1515, gripper: 500 },
      '9': { name: 'Try To Pick', type: 'sequence', sequence: [
        { delay: 300, lift: 1630, tilt: 1515, gripper: 2330 },
        { delay: 700, lift: 1200, tilt: 1515, gripper: 2330 }
      ]},
      '0': { name: 'Default Just Hold', type: 'simple', lift: 1100, tilt: 1890, gripper: null },
      // Single servo presets (保留所有原有预设)
      'i': { name: 'Lift Highest', type: 'simple', lift: 960, tilt: null, gripper: null },
      'j': { name: 'Lift Middle', type: 'simple', lift: 1250, tilt: null, gripper: null },
      'n': { name: 'Lift Lowest', type: 'simple', lift: 1630, tilt: null, gripper: null },
      'u': { name: 'Tilt Highest', type: 'simple', lift: null, tilt: 1890, gripper: null },
      'h': { name: 'Tilt Middle', type: 'simple', lift: null, tilt: 1580, gripper: null },
      'b': { name: 'Tilt Lowest', type: 'simple', lift: null, tilt: 1310, gripper: null },
      'g': { name: 'Gesture', type: 'sequence', sequence: [
        { delay: 500, lift: 1150, tilt: 1890, gripper: 2330 },
        { delay: 1500, lift: 1250, tilt: 1510, gripper: 2330 },
        { delay: 2500, lift: 1150, tilt: 1890, gripper: 2330 },
        { delay: 3500, lift: 1250, tilt: 1510, gripper: 2330 },
        { delay: 4500, lift: 1150, tilt: 1890, gripper: 2330 },
      ]},
      '-': { name: 'Close Gripper Only', type: 'simple', lift: null, tilt: null, gripper: 2330 },
      '=': { name: 'Open Gripper Only', type: 'simple', lift: null, tilt: null, gripper: 500 }
    }
    
    // External dependencies (完全保留原接口)
    this.setMotors = null
    this.isSystemPaused = null
    this.stopMovement = null
    this.setServoPWM = null
    this.updateSliderValue = null
    this.setSpeed = null  
    this.togglePause = null  
    
    this.initialized = false
  }
  
  /**
   * Initialize keyboard controls with required dependencies (保持原接口不变)
   */
  init(dependencies) {
    if (!dependencies.setMotors || !dependencies.isSystemPaused || !dependencies.stopMovement ||
        !dependencies.setServoPWM || !dependencies.updateSliderValue || !dependencies.togglePause) {
      console.error('KeyboardControls: Missing required dependencies')
      return false
    }
    
    this.setMotors = dependencies.setMotors
    this.isSystemPaused = dependencies.isSystemPaused
    this.stopMovement = dependencies.stopMovement
    this.setServoPWM = dependencies.setServoPWM
    this.updateSliderValue = dependencies.updateSliderValue
    this.setSpeed = dependencies.setSpeed || this.defaultSetSpeed
    this.togglePause = dependencies.togglePause
    
    this.bindEvents()
    this.initialized = true
    
    console.log('KeyboardControls: Initialized successfully with composite movement support')
    console.log('Controls: WASD=move (supports combinations), [/]=speed, T=4s countdown, SPACEBAR=pause/resume, I/J/N=lift, U/H/B=tilt, -/==gripper, 0-9=presets')
    return true
  }
  
  /**
   * Default setSpeed function (保持不变)
   */
  defaultSetSpeed(level) {
    console.warn('KeyboardControls: setSpeed function not provided, using AJAX fallback')
    if (typeof $ !== 'undefined') {
      $.ajax({url: "set_speed/" + level})
    }
  }
  
  /**
   * Bind keyboard event listeners (保持不变)
   */
  bindEvents() {
    if (typeof $ !== 'undefined') {
      $(document).on("keydown", (e) => this.handleKeyDown(e))
      $(document).on("keyup", (e) => this.handleKeyUp(e))
    } else {
      document.addEventListener("keydown", (e) => this.handleKeyDown(e))
      document.addEventListener("keyup", (e) => this.handleKeyUp(e))
    }
  }
  
  /**
   * Handle keydown events (增强但保持兼容)
   */
  handleKeyDown(e) {
    // 保持原始的输入框检查逻辑
    if (typeof $ !== 'undefined') {
      if ($(e.target).is('input[type="text"], input[type="password"], input[type="email"], textarea, select')) {
        return
      }
    } else {
      if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') {
        return
      }
    }
    
    const key = e.key
    
    // Handle spacebar for pause toggle
    if (key === ' ') {
      this.handlePauseToggle()
      e.preventDefault()
      return
    }
    
    // Handle speed switching keys
    if (key === '[') {
      if (!this.isSystemPaused()) {
        this.setSpeedDirect('slow')
      }
      e.preventDefault()
      return
    }
    
    if (key === ']') {
      if (!this.isSystemPaused()) {
        this.setSpeedDirect('moderate')
      }
      e.preventDefault()
      return
    }
    
    if (key === '\\') {
      if (!this.isSystemPaused()) {
        this.setSpeedDirect('fast')
      }
      e.preventDefault()
      return
    }
    
    // Handle countdown timer - T key
    if (key === 't' || key === 'T') {
      if (!this.isSystemPaused()) {
        this.startCountdown(4)
      }
      e.preventDefault()
      return
    }
    
    // Handle preset keys - immediate actions (保持原逻辑)
    if (['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'g', 'i', 'j', 'n', 'u', 'h', 'b', '-', '='].includes(key)) {
      if (!this.isSystemPaused()) {
        this.executePreset(key)
      }
      e.preventDefault()
      return
    }
    
    // Handle movement and continuous servo keys (保持原逻辑，但增强运动控制)
    if (key in this.keys_pressed && !this.keys_pressed[key]) {
      this.keys_pressed[key] = true
      
      if (!this.isSystemPaused()) {
        // Handle movement keys with new composite logic
        if (['w', 'a', 's', 'd'].includes(key)) {
          this.updateMovementFromKeys()
        }
      }
      e.preventDefault()
    }
  }
  
  /**
   * Handle keyup events (保持原逻辑)
   */
  handleKeyUp(e) {
    // 保持原始的输入框检查逻辑
    if (typeof $ !== 'undefined') {
      if ($(e.target).is('input[type="text"], input[type="password"], input[type="email"], textarea, select')) {
        return
      }
    } else {
      if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') {
        return
      }
    }
    
    const key = e.key
    
    // Ignore immediate action keys for keyup
    if (['[', ']', '\\', ' ', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 't', 'T','g'].includes(key)) {
      return
    }
    
    if (key in this.keys_pressed && this.keys_pressed[key]) {
      this.keys_pressed[key] = false
      
      // Handle movement keys
      if (['w', 'a', 's', 'd'].includes(key)) {
        this.updateMovementFromKeys()
      }
      
      e.preventDefault()
    }
  }
  
  /**
   * Set speed directly (保持不变)
   */
  setSpeedDirect(speedLevel) {
    if (!this.speed_levels.includes(speedLevel)) {
      console.warn(`KeyboardControls: Invalid speed level: ${speedLevel}`)
      return
    }
    
    this.current_speed_index = this.speed_levels.indexOf(speedLevel)
    this.setSpeed(speedLevel)
    this.showSpeedFeedback(speedLevel, speedLevel.toUpperCase())
    
    console.log(`KeyboardControls: Speed set directly to ${speedLevel}`)
  }
  
  /**
   * Show speed change feedback (保持不变)
   */
  showSpeedFeedback(speedLevel, action) {
    if (typeof $ === 'undefined') return // 安全检查
    
    const statusMsg = $(`<div class="speed-feedback">Speed: ${speedLevel.toUpperCase()}</div>`)
    statusMsg.css({
      position: 'fixed',
      top: '60px',
      right: '20px',
      background: '#2196F3',
      color: 'white',
      padding: '10px 20px',
      borderRadius: '5px',
      zIndex: 1000,
      fontSize: '14px',
      fontWeight: 'bold'
    })
    
    $('body').append(statusMsg)
    
    setTimeout(() => {
      statusMsg.fadeOut(300, () => statusMsg.remove())
    }, 2000)
  }
  
  /**
   * Handle pause toggle (保持不变)
   */
  handlePauseToggle() {
    if (!this.initialized || !this.togglePause) {
      console.warn('KeyboardControls: togglePause function not available')
      return
    }
    
    const wasPaused = this.isSystemPaused()
    this.togglePause()
    this.showPauseFeedback(!wasPaused)
    
    console.log(`KeyboardControls: Pause toggled via spacebar`)
  }
  
  /**
   * Show pause feedback (保持不变)
   */
  showPauseFeedback(isPaused) {
    if (typeof $ === 'undefined') return // 安全检查
    
    const statusMsg = $(`<div class="pause-feedback">System ${isPaused ? 'PAUSED' : 'RESUMED'}</div>`)
    statusMsg.css({
      position: 'fixed',
      top: '100px',
      right: '20px',
      background: isPaused ? '#FF5722' : '#4CAF50',
      color: 'white',
      padding: '10px 20px',
      borderRadius: '5px',
      zIndex: 1000,
      fontSize: '14px',
      fontWeight: 'bold'
    })
    
    $('body').append(statusMsg)
    
    setTimeout(() => {
      statusMsg.fadeOut(300, () => statusMsg.remove())
    }, 2000)
  }
  
  /**
   * Sync speed level (保持不变)
   */
  syncSpeedLevel(speedLevel) {
    const index = this.speed_levels.indexOf(speedLevel)
    if (index !== -1) {
      this.current_speed_index = index
      console.log(`KeyboardControls: Speed synced to ${speedLevel}`)
    }
  }
  
  /**
   * Get current speed (保持不变)
   */
  getCurrentSpeed() {
    return this.speed_levels[this.current_speed_index]
  }
  
  /**
   * Execute preset (Enhanced with gesture auto-timer)
   */
  executePreset(presetKey) {
    if (!this.initialized) {
      console.warn('KeyboardControls: Not initialized')
      return
    }
    
    const preset = this.presets[presetKey]
    if (!preset) {
      console.warn(`KeyboardControls: Invalid preset key: ${presetKey}`)
      return
    }
    
    console.log(`KeyboardControls: Executing preset ${presetKey}: ${preset.name}`)
    
    // 安全获取slider元素
    const liftSlider = document.getElementById('liftSlider')
    const tiltSlider = document.getElementById('tiltSlider')
    const gripperSlider = document.getElementById('gripperSlider')
    
    if (!liftSlider || !tiltSlider || !gripperSlider) {
      console.warn('KeyboardControls: Slider elements not found')
      return
    }
    
    if (preset.type === 'simple') {
      if (preset.lift !== null && preset.lift !== undefined) {
        liftSlider.value = preset.lift
        this.updateSliderValue('lift', preset.lift)
        this.setServoPWM('lift', preset.lift)
      }
      
      if (preset.tilt !== null && preset.tilt !== undefined) {
        tiltSlider.value = preset.tilt
        this.updateSliderValue('tilt', preset.tilt)
        this.setServoPWM('tilt', preset.tilt)
      }
      
      if (preset.gripper !== null && preset.gripper !== undefined) {
        gripperSlider.value = preset.gripper
        this.updateSliderValue('gripper', preset.gripper)
        this.setServoPWM('gripper', preset.gripper)
      }
    } else if (preset.type === 'sequence') {
      this.executeSequence(preset.sequence)
      
      // 🆕 Auto-start 4s countdown after gesture sequence completes
      if (presetKey === 'g') {
        setTimeout(() => {
          console.log('KeyboardControls: Gesture complete → Auto-starting 11s countdown')
          this.startCountdown(4)
          
          // Show feedback for auto-timer activation
          this.showAutoTimerFeedback()
        }, 4600) // Your sequence ends at 4500ms + 100ms buffer
      }
    }
    
    this.showPresetFeedback(presetKey, preset.name)
  }

  
  /**
   * Execute sequence (保持不变)
   */
  executeSequence(sequence) {
    const liftSlider = document.getElementById('liftSlider')
    const tiltSlider = document.getElementById('tiltSlider')
    const gripperSlider = document.getElementById('gripperSlider')
    
    sequence.forEach((step, index) => {
      setTimeout(() => {
        if (step.lift !== null && step.lift !== undefined) {
          liftSlider.value = step.lift
          this.updateSliderValue('lift', step.lift)
          this.setServoPWM('lift', step.lift)
        }
        
        if (step.tilt !== null && step.tilt !== undefined) {
          tiltSlider.value = step.tilt
          this.updateSliderValue('tilt', step.tilt)
          this.setServoPWM('tilt', step.tilt)
        }
        
        if (step.gripper !== null && step.gripper !== undefined) {
          gripperSlider.value = step.gripper
          this.updateSliderValue('gripper', step.gripper)
          this.setServoPWM('gripper', step.gripper)
        }
      }, step.delay)
    })
  }
  
  /**
   * Show preset feedback (保持不变)
   */
  showPresetFeedback(presetKey, presetName) {
    if (typeof $ === 'undefined') return // 安全检查
    
    const statusMsg = $(`<div class="preset-feedback">Preset ${presetKey}: ${presetName}</div>`)
    statusMsg.css({
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: '#4CAF50',
      color: 'white',
      padding: '10px 20px',
      borderRadius: '5px',
      zIndex: 1000,
      fontSize: '14px',
      fontWeight: 'bold'
    })
    
    $('body').append(statusMsg)
    
    setTimeout(() => {
      statusMsg.fadeOut(300, () => statusMsg.remove())
    }, 2000)
  }
  
  /**
   * Start countdown timer
   */
  startCountdown(seconds) {
    // 清除之前的倒计时（如果有）
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval)
    }
    
    let remainingSeconds = seconds
    
    // 显示初始倒计时
    this.showCountdownFeedback(remainingSeconds)
    
    // 每秒更新一次
    this.countdownInterval = setInterval(() => {
      remainingSeconds--
      
      if (remainingSeconds > 0) {
        this.showCountdownFeedback(remainingSeconds)
      } else {
        // 倒计时结束
        clearInterval(this.countdownInterval)
        this.countdownInterval = null
        this.showCountdownComplete()
      }
    }, 1000)
    
    console.log(`KeyboardControls: Started ${seconds}s countdown`)
  }
  
  /**
   * Show countdown feedback
   */
  showCountdownFeedback(seconds) {
    if (typeof $ === 'undefined') return
    
    // 移除之前的倒计时显示
    $('.countdown-feedback').remove()
    
    const statusMsg = $(`<div class="countdown-feedback">Countdown: ${seconds}s</div>`)
    statusMsg.css({
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: seconds <= 3 ? '#FF5722' : '#2196F3',  // 最后3秒变红
      color: 'white',
      padding: '10px 20px',
      borderRadius: '5px',
      zIndex: 1000,
      fontSize: '14px',
      fontWeight: 'bold'
    })
    
    $('body').append(statusMsg)
  }
  
  /**
   * Show countdown complete message
   */
  showCountdownComplete() {
    if (typeof $ === 'undefined') return
    
    $('.countdown-feedback').remove()
    
    const statusMsg = $(`<div class="countdown-feedback">Countdown Complete!</div>`)
    statusMsg.css({
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: '#4CAF50',
      color: 'white',
      padding: '10px 20px',
      borderRadius: '5px',
      zIndex: 1000,
      fontSize: '14px',
      fontWeight: 'bold'
    })
    
    $('body').append(statusMsg)
    
    setTimeout(() => {
      statusMsg.fadeOut(300, () => statusMsg.remove())
    }, 2000)
  }
  
  /**
   * 🆕 增强的运动控制 - 支持复合运动，但保持向后兼容
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

    // 没有按键时停止
    if (!forward && !backward && !left && !right) {
      this.stopMovement()
      return
    }

    // 暂停时停止
    if (this.isSystemPaused()) {
      this.stopMovement()
      return
    }

    // 🆕 复合运动逻辑（新功能，但不影响原有功能）
    const hasForwardBackward = forward || backward
    const hasLeftRight = left || right
    
    // 如果同时有前后和左右按键，使用复合运动
    if (hasForwardBackward && hasLeftRight) {
      this.handleCompositeMovement(forward, backward, left, right)
    } else {
      // 否则使用原有的单一运动逻辑，保持完全兼容
      this.handleSingleMovement(forward, backward, left, right)
    }
  }
  
  /**
   * 🆕 处理复合运动（新功能）
   */
  handleCompositeMovement(forward, backward, left, right) {
    const currentSpeed = this.getCurrentSpeed()
    let finalLeft = 0
    let finalRight = 0
    
    // 硬编码的复合运动值
    if (forward && left) {
      // WA - 前进左转
      if (currentSpeed === 'slow') {
        finalLeft = -2
        finalRight = 5
      } else if (currentSpeed === 'moderate') {
        finalLeft = 40
        finalRight = 110
      } else { // fast
        finalLeft = 200
        finalRight = 330
      }
    } else if (forward && right) {
      // WD - 前进右转
      if (currentSpeed === 'slow') {
        finalLeft = 5
        finalRight = -2
      } else if (currentSpeed === 'moderate') {
        finalLeft = 110
        finalRight = 40
      } else { // fast
        finalLeft = 330
        finalRight = 200
      }
    } else if (backward && left) {
      // SA - 后退左转
      if (currentSpeed === 'slow') {
        finalLeft = -5
        finalRight = 0
      } else if (currentSpeed === 'moderate') {
        finalLeft = -100
        finalRight = -50
      } else { // fast
        finalLeft = -200
        finalRight = -330
      }
    } else if (backward && right) {
      // SD - 后退右转
      if (currentSpeed === 'slow') {
        finalLeft = 0
        finalRight = -5
      } else if (currentSpeed === 'moderate') {
        finalLeft = -50
        finalRight = -100
      } else { // fast
        finalLeft = -330
        finalRight = -200
      }
    }

    // 限制速度范围
    const maxSpeed = this.getMaxSpeedForCurrentLevel()
    const clampedLeft = Math.max(-maxSpeed, Math.min(maxSpeed, finalLeft))
    const clampedRight = Math.max(-maxSpeed, Math.min(maxSpeed, finalRight))

    // 发送运动命令
    this.setMotors(clampedLeft, clampedRight)
    
    console.log(`${forward?'W':''}${backward?'S':''}${left?'A':''}${right?'D':''} @ ${currentSpeed}: L${clampedLeft} R${clampedRight}`)
    
    this.safeUpdateMotorDisplay(`Composite: L${clampedLeft} R${clampedRight}`)
  }
  
  /**
   * 🔄 处理单一运动（保持原有逻辑完全不变）
   */
  handleSingleMovement(forward, backward, left, right) {
    // 使用原有的服务器端点，保持100%兼容性
    if (forward && !backward) {
      // 纯前进 - 使用服务器端点
      if (typeof $ !== 'undefined') {
        $.ajax({url: "move_forward"})
      }
    } else if (backward && !forward) {
      // 纯后退 - 使用服务器端点
      if (typeof $ !== 'undefined') {
        $.ajax({url: "move_backward"})
      }
    } else if (left && !right) {
      // 纯左旋转 - 使用服务器端点
      if (typeof $ !== 'undefined') {
        $.ajax({url: "rotate_left"})
      }
    } else if (right && !left) {
      // 纯右旋转 - 使用服务器端点
      if (typeof $ !== 'undefined') {
        $.ajax({url: "rotate_right"})
      }
    }
  }
  
  /**
   * 🆕 获取当前速度级别的最大值（新功能）
   */
  getMaxSpeedForCurrentLevel() {
    const currentSpeed = this.getCurrentSpeed()
    
    switch(currentSpeed) {
      case "slow": return 150
      case "moderate": return 200  
      case "fast": return 400
      default: return 300
    }
  }
  
  /**
   * 🔧 安全的电机显示更新（避免依赖不存在的函数）
   */
  safeUpdateMotorDisplay(text) {
    // 检查全局函数是否存在
    if (typeof updateMotorDisplay === 'function') {
      updateMotorDisplay(text)
    } else if (typeof $ !== 'undefined' && $("#motor-display").length > 0) {
      $("#motor-display").text(text)
    } else {
      // 静默处理，不影响功能
      console.log(`Motor: ${text}`)
    }
  }
  
  /**
   * Get key states (保持不变)
   */
  getKeyStates() {
    return { ...this.keys_pressed }
  }
  
  /**
   * Get presets (保持不变)
   */
  getPresets() {
    return { ...this.presets }
  }
  
  /**
   * Update preset (保持不变)
   */
  updatePreset(presetKey, preset) {
    if (presetKey in this.presets) {
      this.presets[presetKey] = { ...preset }
      console.log(`KeyboardControls: Updated preset ${presetKey}: ${preset.name}`)
    }
  }
  
  /**
   * Set parameters (保持不变)
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
   * Emergency stop (保持不变)
   */
  emergencyStop() {
    // Reset movement key states only
    this.keys_pressed.w = false
    this.keys_pressed.a = false
    this.keys_pressed.s = false
    this.keys_pressed.d = false
   
   // Stop movement
   if (this.stopMovement) {
     this.stopMovement()
   }
 }
 
 /**
  * 🆕 获取当前运动状态
  */
 getMovementStatus() {
   const forward = this.keys_pressed.w
   const backward = this.keys_pressed.s
   const left = this.keys_pressed.a
   const right = this.keys_pressed.d
   
   return {
     keys: { forward, backward, left, right },
     speed: this.getCurrentSpeed(),
     paused: this.isSystemPaused ? this.isSystemPaused() : 'unknown',
     initialized: this.initialized
   }
 }
 
 /**
  * Cleanup
  */
 destroy() {
   // Remove event listeners safely
   if (typeof $ !== 'undefined') {
     $(document).off("keydown keyup")
   } else {
     document.removeEventListener("keydown", this.handleKeyDown)
     document.removeEventListener("keyup", this.handleKeyUp)
   }
   
   // Clear timers
   if (this.servo_timer) {
     clearTimeout(this.servo_timer)
     this.servo_timer = null
   }
   
   // Clear countdown timer
   if (this.countdownInterval) {
     clearInterval(this.countdownInterval)
     this.countdownInterval = null
   }
   
   this.initialized = false
   console.log('KeyboardControls: Destroyed safely')
 }
}

// Export for use in other modules (保持不变)
window.KeyboardControls = KeyboardControls

// 🆕 增强的自动加载提示
if (typeof $ !== 'undefined') {
 $(document).ready(function() {
   setTimeout(() => {
     console.log('🎮 Enhanced KeyboardControls loaded!')
     console.log('💡 New features: Composite movement (W+A, W+D, S+A, S+D), T=11s countdown')
   }, 1000)
 })
} else {
 // Fallback for environments without jQuery
 setTimeout(() => {
   console.log('🎮 Enhanced KeyboardControls loaded (no jQuery detected)')
   console.log('⚠️ Some visual feedback features may be limited')
 }, 1000)
}
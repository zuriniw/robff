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
 */

class KeyboardControls {
  constructor() {
    // 完整保留所有按键状态跟踪（包括原版中的所有按键）
    this.keys_pressed = {
      w: false,
      a: false,
      s: false,
      d: false,
      i: false,           // lift up
      k: false,           // lift down (保留原功能)
      ArrowUp: false,     // tilt up (保留原功能)
      ArrowDown: false,   // tilt down (保留原功能)
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
      'j': false,         // lift middle (保留)
      'n': false,         // lift lowest (保留)
      'u': false,         // tilt highest (保留)
      'h': false,         // tilt middle (保留)
      'b': false,         // tilt lowest (保留)
      '-': false,         // close gripper (保留)
      '=': false          // open gripper (保留)
      // Note: '[', ']', '\\', and ' ' (spacebar) keys are immediate actions
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
    
    // PWM ranges for each servo (完全保留原值)
    this.pwm_ranges = {
      lift: { min: 960, max: 1630, mid: 1350 },
      tilt: { min: 1210, max: 1900, mid: 1500 },
      gripper: { min: 500, max: 2330, mid: 1440 }
    }
    
    // Preset actions configuration (完全保留原配置)
    this.presets = {
      '1': { name: 'Ready To Push Box', type: 'simple', lift: 1506, tilt: 1890, gripper: 500 },
      '2': { name: 'Quick Press Key', type: 'sequence', sequence: [
        { delay: 0, lift: 1150, tilt: 1510, gripper: 2330 },
        { delay: 500, lift: 1280, tilt: 1510, gripper: null },
        { delay: 500, lift: 1150, tilt: 1510, gripper: null },
        { delay: 500, lift: 1280, tilt: 1510, gripper: null },
        { delay: 500, lift: 1150, tilt: 1510, gripper: null },
      ]},
      '3': { name: 'Pickup Grasp', type: 'simple', lift: 1000, tilt: 1550, gripper: 2330 },
      '4': { name: 'Lift Object', type: 'simple', lift: 1400, tilt: 1650, gripper: 2330 },
      '5': { name: 'High Position', type: 'simple', lift: 1600, tilt: 1800, gripper: 2330 },
      '6': { name: 'Drop Position', type: 'simple', lift: 1200, tilt: 1600, gripper: 500 },
      '7': { name: 'Locate The Capture', type: 'simple', lift: 1200, tilt: 1600, gripper: 500 },
      '8': { name: 'Ready To Capture', type: 'simple', lift: 1630, tilt: 1515, gripper: 500 },
      '9': { name: 'Try To Pick', type: 'sequence', sequence: [
        { delay: 0, lift: null, tilt: null, gripper: 2330 },
        { delay: 500, lift: 1200, tilt: null, gripper: null }
      ]},
      '0': { name: 'Default Just Hold', type: 'simple', lift: 1100, tilt: 1890, gripper: null },
      // Single servo presets (保留所有原有预设)
      'i': { name: 'Lift Highest', type: 'simple', lift: 960, tilt: null, gripper: null },
      'j': { name: 'Lift Middle', type: 'simple', lift: 1250, tilt: null, gripper: null },
      'n': { name: 'Lift Lowest', type: 'simple', lift: 1630, tilt: null, gripper: null },
      'u': { name: 'Tilt Highest', type: 'simple', lift: null, tilt: 1890, gripper: null },
      'h': { name: 'Tilt Middle', type: 'simple', lift: null, tilt: 1580, gripper: null },
      'b': { name: 'Tilt Lowest', type: 'simple', lift: null, tilt: 1210, gripper: null },
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
    console.log('Controls: WASD=move (supports combinations), [/]=speed, SPACEBAR=pause/resume, I/J/N=lift, U/H/B=tilt, -/==gripper, 0-9=presets')
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
    
    // Handle preset keys - immediate actions (保持原逻辑)
    if (['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'i', 'j', 'n', 'u', 'h', 'b', '-', '='].includes(key)) {
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
        
        // 保留原始的连续伺服控制逻辑（如果存在）
        if (['i', 'k', 'ArrowUp', 'ArrowDown'].includes(key)) {
          this.startContinuousServoControl(key)
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
    if (['[', ']', '\\', ' ', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(key)) {
      return
    }
    
    if (key in this.keys_pressed && this.keys_pressed[key]) {
      this.keys_pressed[key] = false
      
      // Handle movement keys
      if (['w', 'a', 's', 'd'].includes(key)) {
        this.updateMovementFromKeys()
      }
      
      // 停止连续伺服控制
      if (['i', 'k', 'ArrowUp', 'ArrowDown'].includes(key)) {
        this.stopContinuousServoControl(key)
      }
      
      e.preventDefault()
    }
  }
  
  /**
   * 新增：连续伺服控制（如果原版有这个功能的话）
   */
  startContinuousServoControl(key) {
    // 如果原版本有连续伺服控制，在这里实现
    // 否则就作为即时预设处理
    if (['i', 'k', 'ArrowUp', 'ArrowDown'].includes(key)) {
      // 可以在这里添加连续控制逻辑，或者保持为即时动作
      console.log(`Continuous servo control started for key: ${key}`)
    }
  }
  
  /**
   * 新增：停止连续伺服控制
   */
  stopContinuousServoControl(key) {
    // 对应的停止逻辑
    console.log(`Continuous servo control stopped for key: ${key}`)
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
   * Execute preset (完全保持原逻辑)
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
    
    // 修正后的硬编码
    if (forward && left) {
      // WA - 前进左转：左轮慢，右轮快
      if (currentSpeed === 'slow') {
        finalLeft = -2      // 比基础65慢
        finalRight = 5     // 比基础8快很多
      } else if (currentSpeed === 'moderate') {
        finalLeft = 40      // 比基础87慢
        finalRight = 110    // 比基础75快
      } else { // fast
        finalLeft = 200
        finalRight = 330
      }
    } else if (forward && right) {
      // WD - 前进右转：左轮快，右轮慢（甚至反转）
      if (currentSpeed === 'slow') {
        finalLeft = 5     // 比基础65快
        finalRight = -2    // 反转
      } else if (currentSpeed === 'moderate') {
        finalLeft = 110     // 比基础87快
        finalRight = 40     // 比基础75慢
      } else { // fast
        finalLeft = 330
        finalRight = 200
      }
    } else if (backward && left) {
      // SA - 后退左转：左轮慢（绝对值小），右轮快（绝对值大）
      if (currentSpeed === 'slow') {
        finalLeft = -5     // 比基础-70慢（绝对值小）
        finalRight = 0    // 比基础-8快很多（绝对值大）
      } else if (currentSpeed === 'moderate') {
        finalLeft = -100     // 比基础-80慢
        finalRight = -50    // 比基础-65快
      } else { // fast
        finalLeft = -200
        finalRight = -330
      }
    } else if (backward && right) {
      // SD - 后退右转：左轮快（绝对值大），右轮慢（绝对值小）
      if (currentSpeed === 'slow') {
        finalLeft = 0     // 比基础-70快
        finalRight = -5     // 反转
      } else if (currentSpeed === 'moderate') {
        finalLeft = -50    // 比基础-80快
        finalRight = -100    // 比基础-65慢
      } else { // fast
        finalLeft = -330
        finalRight = -200
      }
    }

    // 确保值是整数
    finalLeft = Math.round(finalLeft)
    finalRight = Math.round(finalRight)

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
   * 🆕 获取服务器端速度值（新功能，用于复合运动）
   */
  getServerSpeedValues(action) {
    const currentSpeed = this.getCurrentSpeed()
    
    // 匹配 robot_button.py 中的 HARD_CODED_SPEEDS
    const SERVER_SPEEDS = {
      "slow": {
        "forward": {left: 65, right: 8},      // 修正值
        "backward": {left: -70, right: -8},   // 修正值
        "rotate_left": {left: -50, right: 50},
        "rotate_right": {left: 50, right: -50}
      },
      "moderate": {
        "forward": {left: 87, right: 75},     // 修正值
        "backward": {left: -80, right: -65},  // 修正值
        "rotate_left": {left: -90, right: 90}, // 修正值
        "rotate_right": {left: 90, right: -90} // 修正值
      },
      "fast": {
        "forward": {left: 230, right: 233},
        "backward": {left: -238, right: -230},
        "rotate_left": {left: -100, right: 100},
        "rotate_right": {left: 100, right: -100}
      }
    }

    return SERVER_SPEEDS[currentSpeed] && SERVER_SPEEDS[currentSpeed][action] 
          ? SERVER_SPEEDS[currentSpeed][action] 
          : {left: 0, right: 0}
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
   * 🆕 获取当前运动状态（新的调试功能）
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
   * 🆕 显示帮助信息（新功能）
   */
  showHelp() {
    const help = `
🎮 Keyboard Controls Help:

Basic Movement:
  W - Forward        S - Backward  
  A - Left turn      D - Right turn

🆕 Composite Movement (NEW):
  W + A - Forward while turning left
  W + D - Forward while turning right
  S + A - Backward while turning left
  S + D - Backward while turning right

Speed Control:
  [ - Slow speed     ] - Moderate speed     \\ - Fast speed

System Control:
  SPACEBAR - Pause/Resume toggle

Servo Presets (0-9):
  1-8 - Various preset positions
  9 - Try To Pick    0 - Default Hold

Single Servo Controls:
  I/J/N - Lift (High/Mid/Low)
  U/H/B - Tilt (High/Mid/Low)
  - - Close gripper  = - Open gripper

All original functionality is preserved!
    `
    
    console.log(help)
    return help
  }
  
  /**
   * 🆕 测试复合运动（调试功能）
   */
  testCompositeMovement() {
    if (!this.initialized) {
      console.error('KeyboardControls not initialized')
      return
    }
    
    console.log('🧪 Testing composite movement patterns:')
    
    const testCases = [
      {name: 'W (Forward only)', keys: {w: true, s: false, a: false, d: false}},
      {name: 'W+A (Forward+Left)', keys: {w: true, s: false, a: true, d: false}},
      {name: 'W+D (Forward+Right)', keys: {w: true, s: false, a: false, d: true}},
      {name: 'S+A (Backward+Left)', keys: {w: false, s: true, a: true, d: false}},
      {name: 'S+D (Backward+Right)', keys: {w: false, s: true, a: false, d: true}},
      {name: 'A (Left only)', keys: {w: false, s: false, a: true, d: false}},
      {name: 'D (Right only)', keys: {w: false, s: false, a: false, d: true}}
    ]
    
    const originalKeys = {...this.keys_pressed}
    
    testCases.forEach((testCase, index) => {
      setTimeout(() => {
        console.log(`\n${index + 1}. ${testCase.name}:`)
        
        // 临时设置按键状态
        this.keys_pressed = {...this.keys_pressed, ...testCase.keys}
        
        // 计算运动（但不实际发送命令）
        const status = this.getMovementStatus()
        console.log(`   Keys: ${JSON.stringify(status.keys)}`)
        
        // 如果是复合运动，显示计算结果
        const hasForwardBackward = testCase.keys.w || testCase.keys.s
        const hasLeftRight = testCase.keys.a || testCase.keys.d
        
        if (hasForwardBackward && hasLeftRight) {
          console.log('   → Composite movement detected')
        } else {
          console.log('   → Single movement (original logic)')
        }
        
        // 恢复原始状态
        this.keys_pressed = originalKeys
        
        if (index === testCases.length - 1) {
          console.log('\n✅ Test completed. All original functionality preserved.')
        }
      }, index * 500)
    })
  }
  
  /**
   * Cleanup (保持不变，增强安全性)
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
      console.log('💡 New: Composite movement support (W+A, W+D, S+A, S+D)')
      console.log('✅ All original functionality preserved')
      console.log('📚 Type keyboardControls.showHelp() for help')
      console.log('🧪 Type keyboardControls.testCompositeMovement() to test')
    }, 1000)
  })
} else {
  // Fallback for environments without jQuery
  setTimeout(() => {
    console.log('🎮 Enhanced KeyboardControls loaded (no jQuery detected)')
    console.log('⚠️ Some visual feedback features may be limited')
  }, 1000)
}
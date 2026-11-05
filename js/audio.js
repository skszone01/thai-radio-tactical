/**
 * ว.TACTICAL : ระบบสังเคราะห์เสียงวิทยุสื่อสาร (Synthesized Tactical Radio Audio Engine)
 * ใช้ Web Audio API สร้างเสียงคีย์วิทยุ (PTT Click), เสียงซ่าคลื่นวิทยุ (VHF Squelch Noise),
 * เสียงปล่อยคีย์ (Roger Beep), เสียงแจ้งเตือนคำตอบ และระบบอ่านออกเสียงภาษาไทยผ่าน Bandpass Filter
 * ไม่ต้องพึ่งไฟล์เสียงภายนอก รองรับการรันบน GitHub Pages 100%
 */

class TacticalRadioAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.speaking = false;
    this.activeTimers = new Set();
    this.activeOnEnd = null;
    this.speechToken = 0;
    this.loadPreference();
  }

  _setTimer(callback, delayMs) {
    const safeDelay = Math.max(0, Number(delayMs) || 0);
    const timerId = setTimeout(() => {
      this.activeTimers.delete(timerId);
      try {
        callback();
      } catch (e) {}
    }, safeDelay);
    this.activeTimers.add(timerId);
    return timerId;
  }

  _clearTimers() {
    for (const timerId of this.activeTimers) {
      clearTimeout(timerId);
    }
    this.activeTimers.clear();
  }

  _finishActiveSpeech(withRogerBeep = true) {
    this._clearTimers();
    this.speaking = false;
    if (withRogerBeep && this.enabled) {
      this.playRogerBeep();
    }
    const cb = this.activeOnEnd;
    this.activeOnEnd = null;
    if (typeof cb === 'function') {
      try {
        cb();
      } catch (e) {}
    }
  }

  loadPreference() {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('wo_tactical_audio');
        if (saved !== null) {
          this.enabled = saved === 'true';
        }
      }
    } catch (e) {
      this.enabled = true;
    }
  }

  toggleAudio() {
    this.enabled = !this.enabled;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('wo_tactical_audio', String(this.enabled));
      }
    } catch (e) {}

    if (this.enabled) {
      this.playRogerBeep();
    } else {
      this.stopSpeech();
    }
    return this.enabled;
  }

  ensureContext() {
    if (!this.enabled || typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (typeof AudioCtx === 'function') {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) {
      return null;
    }
    if (!this.ctx || typeof this.ctx.currentTime !== 'number' || !this.ctx.destination) {
      return null;
    }
    return this.ctx;
  }

  /**
   * เสียงกดคีย์วิทยุ (PTT Key-Down Click + Short Carrier Burst)
   */
  playPttPress() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      // 1. Mechanical switch click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.035);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);

      // 2. Brief VHF carrier squelch open
      this.playSquelchBurst(0.06, 0.045);
    } catch (e) {}
  }

  /**
   * เสียงปล่อยคีย์วิทยุ (Motorola/Tactical Dual-Tone Roger Beep + Squelch Tail)
   */
  playRogerBeep() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Dual-step tactical roger tone (1320Hz -> 1046Hz)
      osc.frequency.setValueAtTime(1320, now);
      osc.frequency.setValueAtTime(1046, now + 0.045);

      gain.gain.setValueAtTime(0.11, now);
      gain.gain.setValueAtTime(0.11, now + 0.085);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.115);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);

      // Squelch tail after roger beep
      setTimeout(() => {
        if (this.enabled) {
          this.playSquelchBurst(0.09, 0.055);
        }
      }, 95);
    } catch (e) {}
  }

  /**
   * เสียงซ่าคลื่นวิทยุ (Bandpass-Filtered White Noise Squelch Tail)
   */
  playSquelchBurst(duration = 0.08, volume = 0.05) {
    const safeDuration = Math.max(0.01, Math.min(2.0, Number(duration) || 0.08));
    const safeVolume = Math.max(0.001, Math.min(0.5, Number(volume) || 0.05));

    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const sampleRate = Math.max(8000, Number(ctx.sampleRate) || 44100);
      const frameCount = Math.max(1, Math.floor(sampleRate * safeDuration));
      const buffer = ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < frameCount; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.8;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(1650, now);
      bandpass.Q.setValueAtTime(1.8, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(safeVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + safeDuration);

      noise.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + safeDuration);
    } catch (e) {}
  }

  /**
   * เสียงยืนยันคำตอบถูกต้อง (Tactical Confirmation Chime)
   */
  playCorrect() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1318.5, now + 0.065);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    } catch (e) {}
  }

  /**
   * เสียงแจ้งเตือนคำตอบผิดหรือหมดเวลา (Low Double Buzz)
   */
  playError() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.setValueAtTime(165, now + 0.09);

      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    } catch (e) {}
  }

  /**
   * เสียงติ๊กจับเวลาเมื่อใกล้หมดเวลา
   */
  playTick(urgent = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const isUrgent = Boolean(urgent);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isUrgent ? 1200 : 780, now);

      gain.gain.setValueAtTime(isUrgent ? 0.08 : 0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {}
  }

  /**
   * อ่านออกเสียงประโยควิทยุสื่อสารภาษาไทย พร้อมเอฟเฟกต์กดคีย์-ปล่อยคีย์
   */
  speakTransmission(text, onStart, onEnd) {
    // หยุดการพูดและล้างตัวจับเวลาก่อนหน้าเพื่อป้องกัน callback ซ้อนหรือคีย์ค้าง
    this.stopSpeech();

    const rawText = text == null ? '' : String(text).trim();
    if (!this.enabled || !rawText) {
      if (typeof onEnd === 'function') {
        try {
          onEnd();
        } catch (e) {}
      }
      return;
    }

    const token = ++this.speechToken;
    this.activeOnEnd = typeof onEnd === 'function' ? onEnd : null;

    this.playPttPress();
    if (typeof onStart === 'function') {
      try {
        onStart();
      } catch (e) {}
    }

    // แปลงคำว่า "ว." ให้ออกเสียงว่า "วอ " อย่างเป็นธรรมชาติ
    const spokenText = rawText
      .replace(/ว\.00/g, 'วอ ศูนย์ ศูนย์ ')
      .replace(/ว\.01/g, 'วอ ศูนย์ หนึ่ง ')
      .replace(/ว\.(\d+)/g, 'วอ $1 ')
      .replace(/\//g, ' หรือ ');

    if (
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      !window.speechSynthesis ||
      typeof window.SpeechSynthesisUtterance !== 'function'
    ) {
      this._setTimer(() => {
        if (token !== this.speechToken) return;
        this._finishActiveSpeech(true);
      }, 650);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utter = new window.SpeechSynthesisUtterance(spokenText);
      utter.lang = 'th-TH';
      utter.rate = 1.06;
      utter.pitch = 0.96;

      const voices = typeof window.speechSynthesis.getVoices === 'function'
        ? window.speechSynthesis.getVoices()
        : [];
      if (Array.isArray(voices) && voices.length > 0) {
        const thaiVoice = voices.find(v => v && typeof v.lang === 'string' && v.lang.toLowerCase().includes('th'));
        if (thaiVoice) {
          utter.voice = thaiVoice;
        }
      }

      let finished = false;
      const finishHandler = () => {
        if (finished || token !== this.speechToken) return;
        finished = true;
        this._finishActiveSpeech(true);
      };

      utter.onend = finishHandler;
      utter.onerror = finishHandler;

      this.speaking = true;

      // Safety watchdog timer in case browser speechSynthesis never fires onend
      const maxWaitMs = Math.min(15000, Math.max(2500, spokenText.length * 120));
      this._setTimer(finishHandler, maxWaitMs);

      this._setTimer(() => {
        if (finished || token !== this.speechToken) return;
        try {
          window.speechSynthesis.speak(utter);
        } catch (err) {
          finishHandler();
        }
      }, 90);
    } catch (e) {
      this._finishActiveSpeech(true);
    }
  }

  stopSpeech() {
    this.speechToken++;
    this._clearTimers();
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (e) {}
    this.speaking = false;
    const cb = this.activeOnEnd;
    this.activeOnEnd = null;
    if (typeof cb === 'function') {
      try {
        cb();
      } catch (e) {}
    }
  }
}

window.radioAudio = new TacticalRadioAudio();

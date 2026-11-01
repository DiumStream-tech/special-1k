import { DEFAULT_MUSIC_VOLUME, DEFAULT_SFX_VOLUME } from '../consts/globals'

export default class SoundManager {
  private ctx: AudioContext
  private sfxGain: GainNode
  private musicGain: GainNode
  private _sfxVolume = DEFAULT_SFX_VOLUME
  private _musicVolume = DEFAULT_MUSIC_VOLUME
  private musicPlaying = false
  private musicTimer?: number
  private nextNoteTime = 0
  private beat = 0

  private chords = [
    { bass: 110.0, arp: [220.0, 261.63, 329.63] },
    { bass: 87.31, arp: [174.61, 220.0, 261.63] },
    { bass: 130.81, arp: [261.63, 329.63, 392.0] },
    { bass: 98.0, arp: [196.0, 246.94, 293.66] },
  ]
  private arpPattern = [0, 1, 2, 1, 0, 1, 2, 1]
  private beatDuration = 0.4

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    this.sfxGain = this.ctx.createGain()
    this.sfxGain.gain.value = this._sfxVolume
    this.sfxGain.connect(this.ctx.destination)
    this.musicGain = this.ctx.createGain()
    this.musicGain.gain.value = this._musicVolume
    this.musicGain.connect(this.ctx.destination)
  }

  get sfxVolume() {
    return this._sfxVolume
  }

  get musicVolume() {
    return this._musicVolume
  }

  setSfxVolume(v: number) {
    this._sfxVolume = Math.round(Phaser.Math.Clamp(v, 0, 1) * 100) / 100
    this.sfxGain.gain.value = this._sfxVolume
  }

  setMusicVolume(v: number) {
    this._musicVolume = Math.round(Phaser.Math.Clamp(v, 0, 1) * 100) / 100
    this.musicGain.gain.value = this._musicVolume
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  destroy() {
    this.stopMusic()
    if (this.ctx.state !== 'closed') this.ctx.close()
  }

  private tone(freq: number, duration: number, type: OscillatorType, gain: number, slideTo?: number) {
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + duration)
    osc.connect(g)
    g.connect(this.sfxGain)
    osc.start(t)
    osc.stop(t + duration)
  }

  private noise(duration: number, gain: number, filterFreq: number) {
    const t = this.ctx.currentTime
    const size = Math.floor(this.ctx.sampleRate * duration)
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = filterFreq
    filter.Q.value = 1
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + duration)
    src.connect(filter)
    filter.connect(g)
    g.connect(this.sfxGain)
    src.start(t)
    src.stop(t + duration)
  }

  shoot() {
    this.tone(700, 0.06, 'square', 0.12, 300)
    this.noise(0.05, 0.08, 3000)
  }

  hit() {
    this.tone(180, 0.08, 'triangle', 0.15, 60)
    this.noise(0.06, 0.1, 1500)
  }

  kill() {
    this.tone(150, 0.18, 'sawtooth', 0.18, 50)
    this.tone(400, 0.12, 'sine', 0.12, 100)
  }

  combo(level: number) {
    const base = 500 + Math.min(level, 10) * 80
    this.tone(base, 0.1, 'sine', 0.18)
    this.tone(base * 1.5, 0.15, 'triangle', 0.12)
  }

  startMusic() {
    if (this.musicPlaying) return
    this.musicPlaying = true
    this.beat = 0
    this.nextNoteTime = this.ctx.currentTime + 0.1
    this.scheduler()
  }

  stopMusic() {
    this.musicPlaying = false
    if (this.musicTimer !== undefined) {
      window.clearTimeout(this.musicTimer)
      this.musicTimer = undefined
    }
  }

  private scheduler = () => {
    if (!this.musicPlaying) return
    const lookahead = 0.3
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.scheduleBeat(this.beat, this.nextNoteTime)
      this.nextNoteTime += this.beatDuration
      this.beat = (this.beat + 1) % 32
    }
    this.musicTimer = window.setTimeout(this.scheduler, 50)
  }

  private scheduleBeat(beat: number, time: number) {
    const chordIndex = Math.floor(beat / 8) % 4
    const beatInChord = beat % 8
    const chord = this.chords[chordIndex]

    if (beatInChord === 0) {
      this.musicTone(chord.bass, this.beatDuration * 8 - 0.4, 'sine', 0.5, time)
    }

    const arpIndex = this.arpPattern[beatInChord]
    this.musicTone(chord.arp[arpIndex] * 2, this.beatDuration * 0.9, 'triangle', 0.2, time)
  }

  private musicTone(freq: number, duration: number, type: OscillatorType, gain: number, time: number) {
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(0, time)
    g.gain.linearRampToValueAtTime(gain, time + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, time + duration)
    osc.connect(g)
    g.connect(this.musicGain)
    osc.start(time)
    osc.stop(time + duration)
  }
}
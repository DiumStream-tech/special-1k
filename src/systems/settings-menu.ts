import { GAME_AUTHOR, GAME_FORK_AUTHOR, GAME_VERSION } from '../config'
import { DEFAULT_MUSIC_VOLUME, DEFAULT_SFX_VOLUME } from '../consts/globals'
import TextureKey from '../consts/texture-key'
import SoundManager from './sound-manager'

interface SliderRow {
  left: number
  y: number
  width: number
  color: number
  fill: Phaser.GameObjects.Graphics
  knob: Phaser.GameObjects.Arc
  value: Phaser.GameObjects.BitmapText
  get: () => number
  set: (v: number) => void
}

export default class SettingsMenu {
  private scene: Phaser.Scene
  private sound: SoundManager
  private container: Phaser.GameObjects.Container
  private overlay!: Phaser.GameObjects.Rectangle
  private rows: SliderRow[] = []
  private activeRow?: SliderRow
  private _isOpen = false
  private closing = false
  private pausedTweens: Phaser.Tweens.Tween[] = []
  private fxTween?: Phaser.Tweens.Tween
  private fx = { s: 1, a: 1 }
  private cx = 0
  private cy = 0

  constructor(scene: Phaser.Scene, sound: SoundManager) {
    this.scene = scene
    this.sound = sound
    this.container = scene.add.container(0, 0).setDepth(100).setVisible(false)
    this.build()
    scene.input.on('pointermove', this.onMove, this)
    scene.input.on('pointerup', this.onUp, this)
    scene.input.on('pointerupoutside', this.onUp, this)
    scene.input.keyboard?.on('keydown-ESC', this.toggle, this)
  }

  get isOpen() {
    return this._isOpen
  }

  toggle() {
    if (this.closing) return
    if (this._isOpen) this.close()
    else this.open()
  }

  open() {
    if (this._isOpen || this.closing) return
    this._isOpen = true
    this.pauseGame()
    this.refresh()
    this.overlay.setInteractive()
    this.container.setVisible(true)
    this.playFx(0.94, 0, 1, 1, 260, 'Back.easeOut')
  }

  close() {
    if (!this._isOpen || this.closing) return
    this.closing = true
    this.activeRow = undefined
    this.overlay.disableInteractive()
    this.playFx(this.fx.s, this.fx.a, 0.96, 0, 160, 'Quad.easeIn', () => {
      this.container.setVisible(false)
      this._isOpen = false
      this.closing = false
      this.resumeGame()
    })
  }

  destroy() {
    this.fxTween?.remove()
    this.resumeGame()
    this.scene.input.off('pointermove', this.onMove, this)
    this.scene.input.off('pointerup', this.onUp, this)
    this.scene.input.off('pointerupoutside', this.onUp, this)
    this.scene.input.keyboard?.off('keydown-ESC', this.toggle, this)
    this.container.destroy()
  }

  private playFx(
    fromS: number,
    fromA: number,
    toS: number,
    toA: number,
    duration: number,
    ease: string,
    onDone?: () => void
  ) {
    this.fxTween?.remove()
    this.fx.s = fromS
    this.fx.a = fromA
    this.applyFx()
    this.fxTween = this.scene.tweens.add({
      targets: this.fx,
      s: toS,
      a: toA,
      duration,
      ease,
      onUpdate: () => this.applyFx(),
      onComplete: () => {
        this.fxTween = undefined
        this.applyFx()
        onDone?.()
      },
    })
  }

  private applyFx() {
    const s = this.fx.s
    this.container.setScale(s)
    this.container.setPosition(this.cx * (1 - s), this.cy * (1 - s))
    this.container.setAlpha(this.fx.a)
  }

  private pauseGame() {
    this.scene.physics.world.pause()
    this.pausedTweens = this.scene.tweens.getTweens().filter(t => !t.isPaused())
    this.pausedTweens.forEach(t => t.pause())
    this.scene.time.paused = true
  }

  private resumeGame() {
    this.scene.physics.world.resume()
    this.pausedTweens.forEach(t => {
      if (t.isPaused()) t.resume()
    })
    this.pausedTweens = []
    this.scene.time.paused = false
  }

  private onMove(pointer: Phaser.Input.Pointer) {
    if (!this._isOpen || this.closing || !this.activeRow) return
    this.applyPointer(this.activeRow, pointer.x)
  }

  private onUp() {
    this.activeRow = undefined
  }

  private applyPointer(row: SliderRow, px: number) {
    const v = Phaser.Math.Clamp((px - row.left) / row.width, 0, 1)
    row.set(Math.round(v * 100) / 100)
    this.refresh()
  }

  private refresh() {
    for (const row of this.rows) {
      const v = row.get()
      row.fill.clear()
      row.fill.fillStyle(row.color, 1)
      if (v > 0) row.fill.fillRoundedRect(row.left, row.y - 11, Math.max(22, row.width * v), 22, 11)
      row.knob.setPosition(row.left + row.width * v, row.y)
      row.value.setText(`${Math.round(v * 100)}`)
    }
  }

  private createIcon(x: number, y: number, unicode: string, size: number) {
    return this.scene.add
      .text(x, y, unicode, {
        fontFamily: '"Font Awesome 6 Free"',
        fontSize: `${size}px`,
        color: '#000000',
        fontStyle: '900',
      })
      .setOrigin(0.5)
  }

  private addSlider(
    cx: number,
    y: number,
    icon: string,
    label: string,
    color: number,
    get: () => number,
    set: (v: number) => void
  ) {
    const left = cx - 120
    const width = 480

    this.container.add(this.createIcon(cx - 430, y, icon, 56))
    this.container.add(
      this.scene.add.bitmapText(cx - 370, y, TextureKey.Font, label, 44).setOrigin(0, 0.5).setTint(0x000000)
    )

    const track = this.scene.add.graphics()
    track.fillStyle(0xd9d9d9, 1)
    track.fillRoundedRect(left, y - 11, width, 22, 11)
    this.container.add(track)

    const fill = this.scene.add.graphics()
    this.container.add(fill)

    const knob = this.scene.add.circle(left, y, 24, 0xffffff).setStrokeStyle(6, 0x000000)
    this.container.add(knob)

    const value = this.scene.add
      .bitmapText(left + width + 130, y, TextureKey.Font, '0', 44)
      .setOrigin(1, 0.5)
      .setTint(0x000000)
    this.container.add(value)

    const row: SliderRow = { left, y, width, color, fill, knob, value, get, set }
    this.rows.push(row)

    const zone = this.scene.add.rectangle(left + width / 2, y, width + 64, 80, 0xffffff, 0)
    zone.setInteractive({ useHandCursor: true })
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.activeRow = row
      this.applyPointer(row, pointer.x)
    })
    this.container.add(zone)
  }

  private addButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    base: number,
    hover: number,
    onClick: () => void
  ) {
    const g = this.scene.add.graphics()
    const draw = (c: number) => {
      g.clear()
      g.fillStyle(c, 1)
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 18)
      g.lineStyle(5, 0x000000, 1)
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 18)
    }
    draw(base)
    this.container.add(g)

    const text = this.scene.add.bitmapText(x, y, TextureKey.Font, label, 40).setOrigin(0.5).setTint(0x000000)
    this.container.add(text)

    const zone = this.scene.add.rectangle(x, y, w, h, 0xffffff, 0)
    zone.setInteractive({ useHandCursor: true })
    zone.on('pointerover', () => draw(hover))
    zone.on('pointerout', () => draw(base))
    zone.on('pointerdown', onClick)
    this.container.add(zone)
  }

  private addInfoCard(cx: number, top: number, width: number) {
    const rowH = 80
    const pad = 16
    const items = [
      { label: 'AUTHOR', value: GAME_AUTHOR },
      { label: 'FORK BY', value: GAME_FORK_AUTHOR },
      { label: 'VERSION', value: GAME_VERSION },
    ]
    const height = rowH * items.length + pad * 2
    const left = cx - width / 2
    const right = cx + width / 2

    const card = this.scene.add.graphics()
    card.fillStyle(0xf3f3f3, 1)
    card.fillRoundedRect(left, top, width, height, 22)
    card.lineStyle(5, 0x000000, 1)
    card.strokeRoundedRect(left, top, width, height, 22)
    for (let i = 1; i < items.length; i++) {
      card.fillStyle(0xcfcfcf, 1)
      card.fillRect(left + 36, top + pad + rowH * i - 1, width - 72, 3)
    }
    this.container.add(card)

    items.forEach((item, i) => {
      const y = top + pad + rowH * i + rowH / 2

      this.container.add(
        this.scene.add.bitmapText(left + 44, y, TextureKey.Font, item.label, 32).setOrigin(0, 0.5).setTint(0x555555)
      )

      if (item.label === 'VERSION') {
        const pw = 220
        const ph = 58
        const px = right - 44 - pw
        const pill = this.scene.add.graphics()
        pill.fillStyle(0x37d98c, 1)
        pill.fillRoundedRect(px, y - ph / 2, pw, ph, 29)
        pill.lineStyle(4, 0x000000, 1)
        pill.strokeRoundedRect(px, y - ph / 2, pw, ph, 29)
        this.container.add(pill)
        this.container.add(
          this.scene.add.bitmapText(px + pw / 2, y, TextureKey.Font, item.value, 40).setOrigin(0.5).setTint(0x000000)
        )
        return
      }

      this.container.add(
        this.scene.add.bitmapText(right - 44, y, TextureKey.Font, item.value, 44).setOrigin(1, 0.5).setTint(0x000000)
      )
    })
  }

  private build() {
    const w = this.scene.scale.width
    const h = this.scene.scale.height
    const cx = w / 2
    const cy = h / 2
    const t = cy - 536

    this.cx = cx
    this.cy = cy

    this.overlay = this.scene.add.rectangle(0, 0, w, h, 0xffffff, 1).setOrigin(0)
    this.overlay.setInteractive()
    this.container.add(this.overlay)

    const frame = this.scene.add.graphics()
    frame.lineStyle(6, 0x000000, 1)
    frame.strokeRoundedRect(24, 24, w - 48, h - 48, 32)
    frame.fillStyle(0x000000, 1)
    frame.fillRect(cx - 450, t + 160, 900, 4)
    this.container.add(frame)

    this.container.add(
      this.scene.add.bitmapText(cx, t + 80, TextureKey.Font, 'SETTINGS', 80).setOrigin(0.5).setTint(0x000000)
    )

    this.addSlider(
      cx,
      t + 330,
      '\uf001',
      'MUSIC',
      0x37d98c,
      () => this.sound.musicVolume,
      v => this.sound.setMusicVolume(v)
    )
    this.addSlider(
      cx,
      t + 470,
      '\uf028',
      'SFX',
      0xfc5c65,
      () => this.sound.sfxVolume,
      v => this.sound.setSfxVolume(v)
    )

    this.addButton(cx - 200, t + 650, 340, 100, 'RESET', 0xf0f0f0, 0xdcdcdc, () => {
      this.sound.setMusicVolume(DEFAULT_MUSIC_VOLUME)
      this.sound.setSfxVolume(DEFAULT_SFX_VOLUME)
      this.refresh()
    })
    this.addButton(cx + 200, t + 650, 340, 100, 'CLOSE', 0xfc5c65, 0xff7a82, () => this.close())

    this.addInfoCard(cx, t + 800, 900)

    this.refresh()
  }
}
import {
  ARROW_SPEED,
  MAX_ENEMIES,
  RESPAWN_DELAY_MAX,
  RESPAWN_DELAY_MIN,
  SHOOT_COOLDOWN_MS,
  TILE_OVERLAP_OFFSET,
  TILE_SIZE,
} from '../consts/globals'
import SceneKey from '../consts/scene-key'
import TextureKey from '../consts/texture-key'
import { randomCom } from '../data/coms'
import { level } from '../data/level'
import { tilesMatch } from '../data/tiles'
import Arrow from '../prefabs/arrow'
import Enemy from '../prefabs/enemy'
import SettingsMenu from '../systems/settings-menu'
import SoundManager from '../systems/sound-manager'

const colors = [0xffb600, 0xfc5c65, 0x9179ff, 0x37d98c]

const MIN_ARROW_SPEED = 1000
const CHARGE_TIME_MS = 900
const MIN_POWER = 0.2
const BOW_PULLBACK = 14
const BAR_WIDTH = 120
const BAR_HEIGHT = 16
const HIT_MARGIN = 10
const TERRAIN_STEP = 12
const TERRAIN_GRACE = 140

export default class GameScene extends Phaser.Scene {
  private bow!: Phaser.GameObjects.Image
  private hero!: Phaser.GameObjects.Image
  private heroBaseX = 0
  private recoilTween?: Phaser.Tweens.Tween
  private lastShotTime = 0
  private ground!: Phaser.Physics.Arcade.StaticGroup
  private arrows!: Phaser.Physics.Arcade.Group
  private enemies!: Phaser.Physics.Arcade.Group
  private bloodEmitter!: Phaser.GameObjects.Particles.ParticleEmitter
  private killsNumber!: number
  private killsText!: Phaser.GameObjects.BitmapText
  private toastContainer!: Phaser.GameObjects.Container
  private killsToasts: Phaser.GameObjects.BitmapText[] = []
  private sfx!: SoundManager
  private settingsMenu!: SettingsMenu
  private comboCount = 0
  private comboTimer?: Phaser.Time.TimerEvent
  private comboText!: Phaser.GameObjects.BitmapText
  private gearIcon!: Phaser.GameObjects.Text
  private clouds: Phaser.GameObjects.Image[] = []
  private charging = false
  private chargeStart = 0
  private aimAngle = 0
  private chargeBar!: Phaser.GameObjects.Graphics
  private hitLine = new Phaser.Geom.Line()
  private hitRect = new Phaser.Geom.Rectangle()

  constructor() {
    super({ key: SceneKey.Game })
  }

  init() {
    this.killsNumber = 0
    this.comboCount = 0
    this.killsToasts = []
    this.recoilTween = undefined
    this.comboTimer = undefined
    this.lastShotTime = 0
    this.clouds = []
    this.charging = false
    this.chargeStart = 0
    this.aimAngle = 0
  }

  create() {
    this.createMap()
    this.createClouds()
    this.createHero()
    this.createEnemies()
    this.createParticles()
    this.createHud()

    this.physics.add.collider(this.enemies, this.ground)

    this.events.on('enemy-lost', this.onEnemyLost, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this)

    this.input.once('pointerdown', () => {
      this.sfx.resume()
      this.sfx.startMusic()
    })
  }

  update(time: number, delta: number) {
    if (this.settingsMenu?.isOpen) {
      if (this.charging) this.cancelCharge()
      return
    }

    if (this.charging) this.updateCharge()

    this.checkArrowHits()

    if (!this.clouds || this.clouds.length === 0) return

    const dt = delta / 1000

    this.clouds.forEach(cloud => {
      const speed = cloud.getData('speed') as number
      cloud.x -= speed * dt

      if (cloud.x < -cloud.displayWidth) {
        cloud.x = this.scale.width + cloud.displayWidth
        cloud.y = Phaser.Math.Between(50, 800)
        cloud.setData('speed', Phaser.Math.FloatBetween(8, 120))
        cloud.setScale(Phaser.Math.FloatBetween(0.8, 2))
        cloud.setAlpha(Phaser.Math.FloatBetween(0.7, 1))
      }
    })
  }

  private onShutdown() {
    this.events.off('enemy-lost', this.onEnemyLost, this)
    this.input.off('pointermove', this.aim, this)
    this.input.off('pointerdown', this.startCharge, this)
    this.input.off('pointerup', this.releaseCharge, this)
    this.input.off('pointerupoutside', this.releaseCharge, this)
    this.comboTimer?.remove()
    this.settingsMenu?.destroy()
    this.sfx?.destroy()
  }

  private onEnemyLost(enemy: Enemy) {
    this.time.delayedCall(
      Phaser.Math.Between(RESPAWN_DELAY_MIN, RESPAWN_DELAY_MAX),
      () => this.respawnEnemy(enemy)
    )
  }

  private findTerrainHit(px: number, py: number, cx: number, cy: number) {
    const dx = cx - px
    const dy = cy - py
    const dist = Math.hypot(dx, dy)
    const steps = Math.max(1, Math.ceil(dist / TERRAIN_STEP))

    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const x = px + dx * t
      const y = py + dy * t
      const bodies = this.physics.overlapRect(x - 3, y - 3, 6, 6, false, true)
      if (bodies.length > 0) return { x, y }
    }

    return null
  }

  private checkArrowHits() {
    const arrows = this.arrows.getChildren().slice() as Arrow[]
    const enemies = this.enemies.getChildren() as Enemy[]

    for (const arrow of arrows) {
      if (!arrow.active) continue

      const px = arrow.getData('px') as number | undefined
      const py = arrow.getData('py') as number | undefined
      const cx = arrow.x
      const cy = arrow.y

      if (px === undefined || py === undefined) {
        arrow.setData('px', cx)
        arrow.setData('py', cy)
        continue
      }

      this.hitLine.setTo(px, py, cx, cy)

      let target: Enemy | undefined
      let best = Infinity

      for (const enemy of enemies) {
        if (!enemy.active || !enemy.visible) continue
        const body = enemy.body as Phaser.Physics.Arcade.Body
        if (!body || !body.enable) continue

        this.hitRect.setTo(
          body.x - HIT_MARGIN,
          body.y - HIT_MARGIN,
          body.width + HIT_MARGIN * 2,
          body.height + HIT_MARGIN * 2
        )

        const hit =
          Phaser.Geom.Rectangle.Contains(this.hitRect, cx, cy) ||
          Phaser.Geom.Intersects.LineToRectangle(this.hitLine, this.hitRect)

        if (!hit) continue

        const d = (enemy.x - px) * (enemy.x - px) + (enemy.y - py) * (enemy.y - py)
        if (d < best) {
          best = d
          target = enemy
        }
      }

      const sx = (arrow.getData('sx') as number | undefined) ?? px
      const sy = (arrow.getData('sy') as number | undefined) ?? py
      const farEnough = Math.hypot(cx - sx, cy - sy) > TERRAIN_GRACE

      let terrain: { x: number; y: number } | null = null
      if (farEnough) terrain = this.findTerrainHit(px, py, cx, cy)

      if (terrain && target) {
        const td = (terrain.x - px) * (terrain.x - px) + (terrain.y - py) * (terrain.y - py)
        if (td < best) target = undefined
        else terrain = null
      }

      if (target) {
        this.handleKill(arrow, target)
      } else if (terrain) {
        this.createImpact(terrain.x, terrain.y)
        arrow.destroy()
      } else {
        arrow.setData('px', cx)
        arrow.setData('py', cy)
      }
    }
  }

  private createImpact(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
      const p = this.add.circle(x, y, 3, 0x8a8a8a)
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * Phaser.Math.Between(15, 40),
        y: y + Math.sin(angle) * Phaser.Math.Between(15, 40),
        alpha: 0,
        scale: 0,
        duration: 250,
        ease: 'Power2',
        onComplete: () => p.destroy(),
      })
    }
  }

  private spawnX() {
    const w = this.scale.width
    return Phaser.Math.Between(Math.round(w * 0.684), Math.round(w * 0.929))
  }

  private spawnY() {
    return Phaser.Math.Between(300, 800)
  }

  private tileAt(i: number, j: number) {
    const row = level[Math.min(i, level.length - 1)]
    const id = row[Math.min(j, row.length - 1)]
    if (i >= level.length && id === 2) return 1
    return id
  }

  private createMap() {
    this.ground = this.physics.add.staticGroup()
    const water = this.physics.add.staticGroup()
    const step = TILE_SIZE - TILE_OVERLAP_OFFSET
    const cols = Math.ceil(this.scale.width / step) + 1
    const rows = Math.ceil(this.scale.height / step)
    let waterIndex = 0

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const tileId = this.tileAt(i, j)
        if (tileId === 0) continue

        const isWater = tileId === 2
        const group = isWater ? water : this.ground
        const tile = group.create(
          j * TILE_SIZE - TILE_OVERLAP_OFFSET * j,
          i * TILE_SIZE - TILE_OVERLAP_OFFSET * i,
          TextureKey.Sprite,
          tilesMatch[tileId]
        ) as Phaser.Physics.Arcade.Sprite
        tile.setOrigin(0)

        if (isWater) {
          tile.y += 4
          this.tweens.add({
            targets: tile,
            y: tile.y + 20,
            yoyo: true,
            repeat: -1,
            duration: 1000,
            ease: 'Power1',
            delay: waterIndex * 200,
          })
          waterIndex++
        } else {
          tile.refreshBody()
        }
      }
    }
  }

  private createClouds() {
    const cloudCount = Math.round(35 * (this.scale.width / 2046))

    for (let i = 0; i < cloudCount; i++) {
      const x = Phaser.Math.Between(0, this.scale.width)
      const y = Phaser.Math.Between(50, 800)
      const texture = i % 2 === 0 ? TextureKey.Cloud1 : TextureKey.Cloud2

      const scale = Phaser.Math.FloatBetween(0.8, 2)
      const alpha = Phaser.Math.FloatBetween(0.7, 1)

      const cloud = this.add.image(x, y, texture)
        .setScale(scale)
        .setAlpha(alpha)
        .setDepth(-1)

      cloud.setData('speed', Phaser.Math.FloatBetween(8, 120))
      this.clouds.push(cloud)
    }
  }

  private createHero() {
    this.hero = this.add.image(160, 1286, TextureKey.Hero).setOrigin(0.5, 0.5)
    this.heroBaseX = this.hero.x
    this.bow = this.add.image(205, 1286, TextureKey.Bow).setOrigin(0.5, 0.5)
    this.chargeBar = this.add.graphics().setDepth(50)
    this.input.on('pointermove', this.aim, this)
    this.input.on('pointerdown', this.startCharge, this)
    this.input.on('pointerup', this.releaseCharge, this)
    this.input.on('pointerupoutside', this.releaseCharge, this)
  }

  private createEnemies() {
    this.arrows = this.physics.add.group({ classType: Arrow, runChildUpdate: true })
    this.enemies = this.physics.add.group({ classType: Enemy, runChildUpdate: true })

    for (let i = 0; i < MAX_ENEMIES; i++) {
      const enemy = this.enemies.getFirstDead(true, this.spawnX(), this.spawnY()) as Enemy
      enemy.color = Phaser.Math.Between(1, 4)
      enemy.pseudo = randomCom()
    }
  }

  private createParticles() {
    const g = this.make.graphics({}, false)
    g.fillStyle(0xff004d)
    g.fillRect(0, 0, 10, 10)
    g.generateTexture('blood', 10, 10)
    g.destroy()

    this.bloodEmitter = this.add.particles(0, 0, 'blood', {
      speed: { min: -200, max: 200 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      emitting: false,
      gravityY: 400,
      quantity: 30,
    })
  }

  private createHud() {
    this.killsText = this.add.bitmapText(
      64,
      64,
      TextureKey.Font,
      `Kills: ${this.killsNumber.toString().padStart(4, '0')}`,
      48
    )
    this.toastContainer = this.add.container(this.heroBaseX - 20, this.hero.y - 140)

    this.comboText = this.add
      .bitmapText(this.scale.width / 2, 80, TextureKey.Font, '', 48)
      .setOrigin(0.5)
      .setVisible(false)

    this.sfx = new SoundManager()
    this.settingsMenu = new SettingsMenu(this, this.sfx)

    this.gearIcon = this.add.text(this.scale.width - 60, 60, '\uf013', {
      fontFamily: '"Font Awesome 6 Free"',
      fontSize: '48px',
      color: '#000000',
      fontStyle: '900'
    })
    .setOrigin(0.5)
    .setDepth(200)
    .setInteractive({ useHandCursor: true })
    .on('pointerover', () => this.gearIcon.setColor('#ff0000'))
    .on('pointerout', () => this.gearIcon.setColor('#000000'))
    .on('pointerdown', () => this.settingsMenu.toggle())
  }

  private getPower() {
    const t = Phaser.Math.Clamp((this.time.now - this.chargeStart) / CHARGE_TIME_MS, 0, 1)
    return MIN_POWER + (1 - MIN_POWER) * t
  }

  private placeBow(angle: number, pullback: number) {
    const dist = 40 - pullback
    this.bow.setRotation(angle)
    this.bow.x = this.heroBaseX + dist * Math.cos(angle)
    this.bow.y = this.hero.y + dist * Math.sin(angle)
  }

  private aim(pointer: Phaser.Input.Pointer) {
    if (this.settingsMenu?.isOpen) return
    if (pointer.x < this.heroBaseX || pointer.y > this.hero.y) return

    const angle = Phaser.Math.Angle.Between(this.heroBaseX, this.hero.y, pointer.x, pointer.y)
    this.aimAngle = Phaser.Math.Clamp(angle, -Math.PI / 2, 0)
    const pullback = this.charging ? BOW_PULLBACK * this.getPower() : 0
    this.placeBow(this.aimAngle, pullback)
  }

  private startCharge(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) {
    if (currentlyOver && currentlyOver.length > 0) return
    if (this.settingsMenu?.isOpen) return
    if (pointer.x < this.heroBaseX || pointer.y > this.hero.y) return

    this.aim(pointer)
    this.charging = true
    this.chargeStart = this.time.now
    this.sfx.resume()
  }

  private updateCharge() {
    const power = this.getPower()
    this.placeBow(this.aimAngle, BOW_PULLBACK * power)

    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      new Phaser.Display.Color(55, 217, 140),
      new Phaser.Display.Color(252, 92, 101),
      100,
      Math.round(power * 100)
    )
    const color = Phaser.Display.Color.GetColor(c.r, c.g, c.b)

    const x = this.heroBaseX - BAR_WIDTH / 2
    const y = this.hero.y - 100

    this.chargeBar.clear()
    this.chargeBar.fillStyle(0xffffff, 1)
    this.chargeBar.fillRoundedRect(x, y, BAR_WIDTH, BAR_HEIGHT, 8)
    this.chargeBar.fillStyle(color, 1)
    this.chargeBar.fillRoundedRect(x, y, Math.max(12, BAR_WIDTH * power), BAR_HEIGHT, 8)
    this.chargeBar.lineStyle(3, 0x000000, 1)
    this.chargeBar.strokeRoundedRect(x, y, BAR_WIDTH, BAR_HEIGHT, 8)
  }

  private cancelCharge() {
    this.charging = false
    this.chargeBar.clear()
    this.placeBow(this.aimAngle, 0)
  }

  private releaseCharge() {
    if (!this.charging) return

    const power = this.getPower()
    this.cancelCharge()

    if (this.settingsMenu?.isOpen) return

    const now = this.time.now
    if (now - this.lastShotTime < SHOOT_COOLDOWN_MS) return

    const arrow = this.arrows.get(this.heroBaseX, this.hero.y, TextureKey.Arrow) as Phaser.Physics.Arcade.Image
    if (!arrow) return

    this.lastShotTime = now

    this.sfx.resume()
    this.sfx.shoot()

    const speed = MIN_ARROW_SPEED + (ARROW_SPEED - MIN_ARROW_SPEED) * power

    arrow.setActive(true)
    arrow.setVisible(true)
    arrow.setRotation(this.aimAngle)
    arrow.setData('px', this.heroBaseX)
    arrow.setData('py', this.hero.y)
    arrow.setData('sx', this.heroBaseX)
    arrow.setData('sy', this.hero.y)
    this.physics.velocityFromRotation(this.aimAngle, speed, arrow.body!.velocity)

    this.createMuzzleFlash(power)
    this.recoilHero(power)
  }

  private createMuzzleFlash(power: number) {
    const flash = this.add.circle(this.bow.x, this.bow.y, 8 + 10 * power, 0xffdd00)
    this.tweens.add({ targets: flash, scale: 0, alpha: 0, duration: 100, onComplete: () => flash.destroy() })
  }

  private recoilHero(power: number) {
    this.recoilTween?.remove()
    this.hero.x = this.heroBaseX
    this.recoilTween = this.tweens.add({
      targets: this.hero,
      x: this.heroBaseX + 3 + 5 * power,
      duration: 50,
      yoyo: true,
      ease: 'Power2',
      onComplete: () => {
        this.hero.x = this.heroBaseX
        this.recoilTween = undefined
      },
    })
  }

  private respawnEnemy(enemy: Enemy) {
    if (!enemy.scene) return

    const x = this.spawnX()
    const y = this.spawnY()

    this.tweens.killTweensOf(enemy)
    enemy.setScale(1)
    enemy.setAlpha(1)
    enemy.setPosition(x, y)
    enemy.setActive(true)
    enemy.setVisible(true)

    const body = enemy.body as Phaser.Physics.Arcade.Body
    body.enable = true
    body.reset(x, y)
    body.setVelocity(0, 0)

    enemy.setNextJumpY()
    enemy.color = Phaser.Math.Between(1, 4)
    enemy.pseudo = randomCom()
  }

  private handleKill(arrow: Phaser.GameObjects.GameObject, enemy: Enemy) {
    if (!enemy.active) return

    this.bloodEmitter.emitParticleAt(enemy.x, enemy.y)
    arrow.destroy()
    enemy.kill()

    this.sfx.hit()
    this.sfx.kill()
    this.registerKill()

    this.createHitSpark(enemy.x, enemy.y)
    this.spawnFloatingText(enemy.x, enemy.y - 40, `+${this.comboCount}`, colors[enemy.color - 1])

    this.killsNumber++
    this.killsText.setText(`Kills: ${this.killsNumber.toString().padStart(4, '0')}`)
    this.addToast(enemy)

    this.time.delayedCall(
      Phaser.Math.Between(RESPAWN_DELAY_MIN, RESPAWN_DELAY_MAX),
      () => this.respawnEnemy(enemy)
    )
  }

  private registerKill() {
    this.comboCount++
    this.comboTimer?.remove()
    this.comboTimer = this.time.delayedCall(2000, () => this.resetCombo())
    this.updateComboDisplay()
    if (this.comboCount >= 3) this.sfx.combo(this.comboCount)
  }

  private resetCombo() {
    this.comboCount = 0
    this.comboText.setVisible(false)
  }

  private updateComboDisplay() {
    if (this.comboCount < 2) {
      this.comboText.setVisible(false)
      return
    }
    this.tweens.killTweensOf(this.comboText)
    this.comboText
      .setVisible(true)
      .setText(`COMBO x${this.comboCount}`)
      .setTint(colors[(this.comboCount - 2) % colors.length])
      .setScale(1.4)
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 200, ease: 'Back.easeOut' })
  }

  private createHitSpark(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2
      const spark = this.add.circle(x, y, 3, 0xffffff)
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * Phaser.Math.Between(30, 60),
        y: y + Math.sin(angle) * Phaser.Math.Between(30, 60),
        alpha: 0,
        scale: 0,
        duration: 300,
        ease: 'Power2',
        onComplete: () => spark.destroy(),
      })
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: number) {
    const t = this.add.bitmapText(x, y, TextureKey.Font, text, 32).setOrigin(0.5).setTint(color)
    this.tweens.add({
      targets: t,
      y: y - 60,
      alpha: 0,
      duration: 700,
      ease: 'Power2',
      onComplete: () => t.destroy(),
    })
  }

  private addToast(enemy: Enemy) {
    const toast = this.add
      .bitmapText(0, 0, TextureKey.Font, `Anawan *killed* ${enemy.pseudo}`, 24)
      .setCharacterTint(16, -1, true, colors[enemy.color - 1])
    this.toastContainer.add(toast)
    this.killsToasts.push(toast)
    this.positionToasts()

    this.tweens.add({
      targets: toast,
      alpha: 0,
      duration: 2000,
      onComplete: () => {
        toast.destroy()
        const idx = this.killsToasts.indexOf(toast)
        if (idx !== -1) this.killsToasts.splice(idx, 1)
        this.positionToasts()
      },
    })
  }

  private positionToasts() {
    let currentY = 0
    for (let i = this.killsToasts.length - 1; i >= 0; i--) {
      this.killsToasts[i].setPosition(0, -currentY)
      currentY += 24 + 16
    }
  }
}
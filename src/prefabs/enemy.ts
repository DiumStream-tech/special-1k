import TextureKey from '../consts/texture-key'

export default class Enemy extends Phaser.GameObjects.Container {
  private nextJumpAt = 0
  private sprite: Phaser.GameObjects.Image
  private _pseudo: string
  private pseudoText: Phaser.GameObjects.BitmapText
  private _color: number

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y)
    this._pseudo = ''
    this._color = 1

    this.sprite = scene.add.image(0, 0, TextureKey.Sprite, 'subs/sub1.png')
    this.sprite.flipX = true
    this.add(this.sprite)

    scene.physics.add.existing(this)
    this.syncBody()
    this.setNextJumpY()

    this.pseudoText = scene.add.bitmapText(0, -48, TextureKey.Font, '', 16).setOrigin(0.5)
    this.add(this.pseudoText)
  }

  private syncBody() {
    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(this.sprite.width, this.sprite.height)
    body.setOffset(-this.sprite.width / 2, -this.sprite.height / 2)
  }

  get color() {
    return this._color
  }

  set color(color: number) {
    this._color = color
    this.sprite.setFrame(`subs/sub${color}.png`)
    this.syncBody()
  }

  get pseudo() {
    return this._pseudo
  }

  set pseudo(pseudo: string) {
    this._pseudo = pseudo
    this.pseudoText.setText(pseudo)
  }

  update() {
    const body = this.body as Phaser.Physics.Arcade.Body
    if (!body || !body.enable || this.scene.physics.world.isPaused) return

    const grounded = body.blocked.down || body.touching.down
    if (grounded && this.scene.time.now >= this.nextJumpAt) this.jump()

    if (this.x < 0 || this.x > this.scene.scale.width || this.y < 0 || this.y > this.scene.scale.height) {
      this.setActive(false)
      this.setVisible(false)
      body.enable = false
      this.scene.events.emit('enemy-lost', this)
    }
  }

  setNextJumpY() {
    this.nextJumpAt = this.scene.time.now + Phaser.Math.Between(150, 900)
  }

  jump() {
    this.setNextJumpY()
    ;(this.body as Phaser.Physics.Arcade.Body).setVelocityY(Phaser.Math.Between(-400, -1400))
  }

  kill() {
    ;(this.body as Phaser.Physics.Arcade.Body).enable = false
    this.scene.tweens.add({
      targets: this,
      scale: 2,
      duration: 300,
      alpha: 0,
      ease: 'Power1',
      onComplete: () => {
        this.setActive(false)
        this.setVisible(false)
      },
    })
  }
}
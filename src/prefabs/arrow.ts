import TextureKey from '../consts/texture-key'

const HITBOX_SIZE = 20
const GRAVITY_OFFSET = -1200
const MARGIN_TOP = 600
const MARGIN_SIDE = 200

export default class Arrow extends Phaser.Physics.Arcade.Image {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TextureKey.Arrow)
    scene.physics.add.existing(this)

    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(HITBOX_SIZE, HITBOX_SIZE)
    body.setOffset((this.width - HITBOX_SIZE) / 2, (this.height - HITBOX_SIZE) / 2)
    body.setGravityY(GRAVITY_OFFSET)
  }

  update(time: number, delta: number) {
    super.update(time, delta)

    if (this.scene.physics.world.isPaused) return

    const velocity = (this.body as Phaser.Physics.Arcade.Body).velocity
    if (velocity.x !== 0 || velocity.y !== 0) {
      this.setRotation(Math.atan2(velocity.y, velocity.x))
    }

    const w = this.scene.scale.width
    const h = this.scene.scale.height
    if (this.x < -MARGIN_SIDE || this.x > w + MARGIN_SIDE || this.y < -MARGIN_TOP || this.y > h) {
      this.destroy()
    }
  }
}
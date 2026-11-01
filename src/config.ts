import BootScene from './scenes/boot-scene'
import PreloaderScene from './scenes/preloader-scene'
import GameScene from './scenes/game-scene'

export const GAME_AUTHOR = 'ANAWAN'
export const GAME_FORK_AUTHOR = 'DIUMSTREAM'
export const GAME_VERSION = '1.0.0'

const BASE_WIDTH = 2046
const BASE_HEIGHT = 1444
const MAX_WIDTH = 4400

const aspect = window.innerWidth / window.innerHeight
const gameWidth = Math.min(MAX_WIDTH, Math.max(BASE_WIDTH, Math.round(BASE_HEIGHT * aspect)))

export const GameConfig: Phaser.Types.Core.GameConfig = {
  title: '1K',
  version: GAME_VERSION,
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: gameWidth,
    height: BASE_HEIGHT,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: {
        x: 0,
        y: 1600,
      },
    },
  },
  type: Phaser.AUTO,
  pixelArt: true,
  roundPixels: false,
  antialias: false,
  backgroundColor: '#ffffff',
  scene: [BootScene, PreloaderScene, GameScene],
}
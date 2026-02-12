import Phaser from "phaser";

export class AudioManager {
  private masterVolume = 0.7;

  setMasterVolume(volume: number): void {
    this.masterVolume = Phaser.Math.Clamp(volume, 0, 1);
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  playUiTick(scene: Phaser.Scene): void {
    const camera = scene.cameras.main;
    camera.flash(60, 15, 28, 40, false);
  }
}

export const audioManager = new AudioManager();

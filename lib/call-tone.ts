/** Aviso sonoro curto confirmando que o chamado do cliente foi enviado. */
export function playCallTone() {
  try {
    const AudioContext =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof window.AudioContext;
        }
      ).webkitAudioContext;
    const context = new AudioContext();
    [0, 0.18].forEach((delay) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = delay ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.12,
        context.currentTime + delay + 0.01,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + delay + 0.14,
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + delay);
      oscillator.stop(context.currentTime + delay + 0.15);
    });
    setTimeout(() => context.close(), 500);
  } catch {}
}

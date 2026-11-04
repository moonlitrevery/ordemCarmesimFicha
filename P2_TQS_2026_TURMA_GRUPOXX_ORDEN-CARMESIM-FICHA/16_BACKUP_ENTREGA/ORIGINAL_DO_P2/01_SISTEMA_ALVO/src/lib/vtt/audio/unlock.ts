/**
 * Toca um sample mudo dentro do clique: é o gesto que o navegador exige para
 * liberar som e vídeo depois, principalmente no mobile.
 */
export function unlockAudio() {
  try {
    const context = new AudioContext();
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, 22050);
    source.connect(context.destination);
    source.start(0);
    void context
      .resume()
      .catch(() => undefined)
      .finally(() => context.close());
  } catch {
    // Sem Web Audio: a mesa funciona, só não vai ter som.
  }
}

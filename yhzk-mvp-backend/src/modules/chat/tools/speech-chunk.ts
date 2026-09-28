/**
 * 语音分句器（Task 5）
 * 与 Python 侧 SpeechChunkStream 语义对齐：强标点切分；弱标点达到最小长度后切分；
 * 超长无标点也强制切分，保证工具回答同样能驱动数字人分段朗读。
 */
const STRONG = /[。！？；!?;]/;
const WEAK = /[，、,：:]/;
const MIN_WEAK_LEN = 10;
const MAX_LEN = 24;

export class SpeechChunker {
  private buf = '';

  push(text: string): string[] {
    const out: string[] = [];
    for (const ch of String(text || '')) {
      this.buf += ch;
      const strong = STRONG.test(ch);
      const weak = WEAK.test(ch);
      if (strong || (weak && this.buf.length >= MIN_WEAK_LEN) || this.buf.length >= MAX_LEN) {
        const piece = this.buf.trim();
        if (piece) out.push(piece);
        this.buf = '';
      }
    }
    return out;
  }

  flush(): string[] {
    const piece = this.buf.trim();
    this.buf = '';
    return piece ? [piece] : [];
  }
}

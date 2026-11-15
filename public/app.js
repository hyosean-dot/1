const $ = (id) => document.getElementById(id);
const chat = $('chat');
const statusEl = $('status');
const recognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let speechTimer = null;
let cameraStream = null;
let faceTask = null;
let animationFrame = 0;

const VOWEL_MAP = {
  a: 'a', e: 'e', i: 'i', o: 'o', u: 'u',
  'ㅏ': 'a', 'ㅐ': 'a', 'ㅑ': 'a', 'ㅒ': 'a', 'ㅓ': 'e', 'ㅔ': 'e', 'ㅕ': 'e', 'ㅖ': 'e',
  'ㅗ': 'o', 'ㅛ': 'o', 'ㅜ': 'u', 'ㅠ': 'u', 'ㅡ': 'e', 'ㅣ': 'i',
  'ㅘ': 'a', 'ㅙ': 'a', 'ㅚ': 'e', 'ㅝ': 'e', 'ㅞ': 'e', 'ㅟ': 'i', 'ㅢ': 'e'
};

function status(text) {
  statusEl.textContent = text;
}

function bubble(text, who = 'ai') {
  const el = document.createElement('div');
  el.className = `bubble ${who}`;
  el.textContent = text;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function mood(text) {
  const value = String(text || '').toLowerCase();
  let next = '잘하고 있어! 계속 말해볼까?';
  if (/great|excellent|wonderful|맞았|잘했|멋져|좋아|축하/.test(value)) {
    next = '와, 정말 잘했어! ✨';
  } else if (/try|again|어려|괜찮|천천히|걱정/.test(value)) {
    next = '괜찮아, 천천히 해도 돼 🌱';
  } else if (/[?？]/.test(value)) {
    next = '궁금한 게 있구나!';
  }
  $('emotion').textContent = next;
}

function hangulVowel(ch) {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  const vowels = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
  return vowels[Math.floor((code / 28) % 21)];
}

function buildVisemes(text) {
  const parts = [];
  for (const ch of text) {
    if (/[가-힣]/.test(ch)) {
      const v = hangulVowel(ch);
      if (v) parts.push(VOWEL_MAP[v] || 'e');
    } else if (/[aeiou]/i.test(ch)) {
      parts.push(ch.toLowerCase());
    }
  }
  return parts.length ? parts : ['e'];
}

function applyMouth(shape) {
  const dims = {
    a: [8, 6], e: [10, 4], i: [6, 3], o: [5, 9], u: [4, 7], rest: [12, 2]
  };
  const [rx, ry] = dims[shape] || dims.rest;
  $('mouth').setAttribute('rx', String(rx));
  $('mouth').setAttribute('ry', String(ry));
}

function stopAnimation() {
  if (speechTimer) {
    clearTimeout(speechTimer);
    speechTimer = null;
  }
  applyMouth('rest');
}

function speak(text, lang) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const langMap = { English: 'en-US', Korean: 'ko-KR', Japanese: 'ja-JP', Spanish: 'es-ES', French: 'fr-FR' };
  utterance.lang = langMap[lang] || 'en-US';
  utterance.pitch = 1.1;
  utterance.rate = 0.9;

  const sequence = buildVisemes(text);
  let index = 0;
  const ticker = () => {
    if (index >= sequence.length) {
      stopAnimation();
      return;
    }
    applyMouth(sequence[index]);
    index += 1;
    speechTimer = setTimeout(ticker, 110 + Math.min(160, text.length * 4));
  };

  window.speechSynthesis.cancel();
  utterance.onstart = () => {
    stopAnimation();
    ticker();
  };
  utterance.onend = () => {
    stopAnimation();
  };
  window.speechSynthesis.speak(utterance);
}

function looksSensitive(value) {
  return /(?:[가-힣]{2,4}\s?[가-힣]{1,4}\s?[가-힣]{1,4})|(?:[A-Za-z]+\s+[A-Za-z]+\s+[A-Za-z]+)|(?:\d{2,4}[-.]?\d{3,4}[-.]?\d{4})|(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/.test(value);
}

async function ask(text) {
  const clean = String(text || '').trim();
  if (!clean) return;

  if (looksSensitive(clean)) {
    bubble('이름, 주소, 학교, 전화번호 같은 개인정보는 넣지 않아도 돼요. 오늘은 안전하게 단어와 문장만 연습해 보자!', 'ai');
    status('개인정보는 입력하지 않아도 돼요.');
    return;
  }

  bubble(clean, 'user');
  status('AI가 답을 생각하고 있어요…');
  $('sendBtn').disabled = true;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean.slice(0, 300), language: $('language').value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'AI 응답을 가져오지 못했어요.');
    bubble(data.answer, 'ai');
    mood(data.answer);
    speak(data.answer, $('language').value);
    status('대화 중이에요. 이어서 말해 볼까요?');
  } catch (error) {
    bubble('잠시 연결이 어려워요. 조금 뒤에 다시 시도해 주세요.', 'ai');
    status(error.message || '연결에 문제가 있어요.');
  } finally {
    $('sendBtn').disabled = false;
  }
}

function stopListening() {
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
  $('listenBtn').disabled = false;
  $('stopBtn').disabled = true;
  status('다음 말을 기다리고 있어요.');
}

function languageCode() {
  const map = { English: 'en-US', Korean: 'ko-KR', Japanese: 'ja-JP', Spanish: 'es-ES', French: 'fr-FR' };
  return map[$('language').value] || 'en-US';
}

$('listenBtn').addEventListener('click', () => {
  if (!recognitionCtor) {
    status('이 브라우저는 음성 인식을 지원하지 않아요. 글로 입력해 주세요.');
    return;
  }

  recognition = new recognitionCtor();
  recognition.lang = languageCode();
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    $('listenBtn').disabled = true;
    $('stopBtn').disabled = false;
    status('잘 듣고 있어요. 편하게 말해 보세요.');
  };

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || '';
    if (transcript) ask(transcript);
  };

  recognition.onerror = (event) => {
    status(event.error === 'not-allowed' ? '마이크 권한을 허용해 주세요.' : '다시 말해 주세요.');
    stopListening();
  };

  recognition.onend = () => {
    if ($('listenBtn').disabled) {
      stopListening();
    }
  };

  try {
    recognition.start();
  } catch {
    status('음성 인식을 시작할 수 없어요. 잠시 뒤 다시 시도해 주세요.');
  }
});

$('stopBtn').addEventListener('click', () => {
  stopListening();
  if (recognition) {
    try { recognition.abort(); } catch {}
  }
});

$('sendBtn').addEventListener('click', () => {
  const input = $('message');
  ask(input.value);
  input.value = '';
  input.focus();
});

$('message').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    $('sendBtn').click();
  }
});

$('language').addEventListener('change', () => {
  if (recognition) recognition.lang = languageCode();
});

$('cameraBtn').addEventListener('click', async () => {
  const btn = $('cameraBtn');
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    cancelAnimationFrame(animationFrame);
    $('camera').srcObject = null;
    btn.textContent = '📷 얼굴 따라가기';
    btn.setAttribute('aria-pressed', 'false');
    status('얼굴 따라가기를 껐어요.');
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const video = $('camera');
    video.srcObject = cameraStream;
    await video.play();
    btn.textContent = '⏹ 얼굴 추적 끄기';
    btn.setAttribute('aria-pressed', 'true');
    status('카메라는 이 기기 안에서만 처리됩니다.');

    const visionModule = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm');
    const files = await visionModule.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
    faceTask = await visionModule.FaceLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'CPU'
      },
      runningMode: 'VIDEO',
      numFaces: 1
    });

    const track = () => {
      if (!cameraStream || !faceTask) return;
      if (video.readyState >= 2) {
        const face = faceTask.detectForVideo(video, performance.now()).faceLandmarks?.[0]?.[1];
        if (face) {
          const dx = Math.max(-4, Math.min(4, (face.x - 0.5) * -20));
          const dy = Math.max(-4, Math.min(4, (face.y - 0.45) * -20));
          $('pupilL').setAttribute('transform', `translate(${dx} ${dy})`);
          $('pupilR').setAttribute('transform', `translate(${dx} ${dy})`);
        }
      }
      animationFrame = requestAnimationFrame(track);
    };
    track();
  } catch {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
    cameraStream = null;
    $('camera').srcObject = null;
    btn.textContent = '📷 얼굴 따라가기';
    btn.setAttribute('aria-pressed', 'false');
    status('카메라 권한과 HTTPS 연결을 확인해 주세요.');
  }
});

window.addEventListener('pagehide', () => {
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }
});

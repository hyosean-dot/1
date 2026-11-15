const $ = (id) => document.getElementById(id);
const chat = $('chat');
const statusEl = $('status');
const recognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let speechTimer = null;
let cameraStream = null;
let faceTask = null;
let animationFrame = 0;

const vowelMap = {
  'ㅏ':'a','ㅐ':'a','ㅑ':'a','ㅒ':'a','ㅓ':'e','ㅔ':'e','ㅕ':'e','ㅖ':'e','ㅗ':'o','ㅛ':'o','ㅜ':'u','ㅠ':'u','ㅡ':'e','ㅣ':'i',
  'ㅘ':'a','ㅙ':'a','ㅚ':'e','ㅝ':'e','ㅞ':'e','ㅟ':'i','ㅢ':'e'
};
function status(text){statusEl.textContent=text}
function bubble(text,who='ai'){
  const node=document.createElement('div');node.className=`bubble ${who}`;node.textContent=text;chat.appendChild(node);chat.scrollTop=chat.scrollHeight;
}
function mood(text){
  const value=String(text||'').toLowerCase();let label='잘하고 있어! 계속 말해볼까?';
  if(/great|excellent|wonderful|맞았|잘했|멋져|좋아|축하/.test(value))label='와, 정말 잘했어! ✨';
  else if(/try|again|어려|괜찮|천천히|걱정/.test(value))label='괜찮아, 천천히 해도 돼 🌱';
  else if(/[?？]/.test(value))label='궁금한 게 있구나!';
  $('emotion').textContent=label;
}
function isSensitive(text){
  return /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(?:\+?\d[\d ()-]{7,}\d)|(?:(?:내|우리|저희)\s*(?:이름|주소|학교|전화번호|휴대폰|사는\s*곳|집)\s*(?:은|는|이|가|:)?)/i.test(text)
    || /\bmy\s+(?:name|address|school|phone|telephone)\s*(?:is|:)/i.test(text);
}
function getHangulVowel(character){
  const code=character.charCodeAt(0)-0xac00;if(code<0||code>11171)return null;
  const vowels=['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  return vowels[Math.floor(code/28/21)];
}
function vowelSequence(text){
  const result=[];
  for(const char of text){
    if(/[가-힣]/.test(char)){const vowel=getHangulVowel(char);if(vowel)result.push(vowelMap[vowel]||'e');}
    else if(/[aeiou]/i.test(char))result.push(char.toLowerCase());
  }
  return result.length?result:['e'];
}
function setMouth(shape){
  const sizes={a:[8,6],e:[10,4],i:[6,3],o:[5,9],u:[4,7],rest:[12,2]};
  const [rx,ry]=sizes[shape]||sizes.rest;$('mouth').setAttribute('rx',String(rx));$('mouth').setAttribute('ry',String(ry));
}
function clearMouthAnimation(){if(speechTimer){clearTimeout(speechTimer);speechTimer=null;}setMouth('rest');}
function speak(text,language){
  if(!('speechSynthesis' in window))return;
  window.speechSynthesis.cancel();clearMouthAnimation();
  const lang={English:'en-US',Korean:'ko-KR',Japanese:'ja-JP',Spanish:'es-ES',French:'fr-FR'}[language]||'en-US';
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang=lang;utterance.rate=.9;utterance.pitch=1.05;
  const shapes=vowelSequence(text);let index=0;
  const animate=()=>{if(index>=shapes.length){setMouth('rest');speechTimer=null;return;}setMouth(shapes[index++]);speechTimer=setTimeout(animate,Math.max(100,Math.min(220,120+text.length*2)));};
  utterance.onstart=()=>{clearMouthAnimation();animate();};utterance.onend=clearMouthAnimation;utterance.onerror=clearMouthAnimation;
  window.speechSynthesis.speak(utterance);
}
function hasConsent(){
  if($('guardianConsent').checked)return true;
  status('먼저 보호자와 안내 내용을 확인하고 체크해 주세요.');return false;
}
async function ask(text){
  const clean=String(text||'').trim();if(!clean)return;
  if(!hasConsent())return;
  if(isSensitive(clean)){bubble('개인정보는 보내지 않았어요. 이름·주소·학교·전화번호 대신 연습하고 싶은 단어나 문장을 말해 주세요.','ai');status('개인정보로 보이는 내용은 전송하지 않았어요.');return;}
  bubble(clean,'user');status('AI가 답을 생각하고 있어요…');$('sendBtn').disabled=true;
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:clean.slice(0,300),language:$('language').value})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'AI 응답을 가져오지 못했어요.');
    bubble(data.answer,'ai');mood(data.answer);speak(data.answer,$('language').value);status('다음 말을 기다리고 있어요.');
  }catch(error){bubble('잠시 연결이 어려워요. 조금 뒤에 다시 시도해 주세요.','ai');status(error.message||'연결에 문제가 있어요.');}
  finally{$('sendBtn').disabled=false;}
}
function languageCode(){return({English:'en-US',Korean:'ko-KR',Japanese:'ja-JP',Spanish:'es-ES',French:'fr-FR'})[$('language').value]||'en-US';}
function stopListening(){if(recognition){try{recognition.stop();}catch{}}$('listenBtn').disabled=false;$('stopBtn').disabled=true;}
$('listenBtn').addEventListener('click',()=>{
  if(!hasConsent())return;
  if(!recognitionCtor){status('이 브라우저는 음성 인식을 지원하지 않아요. 글로 입력해 주세요.');return;}
  recognition=new recognitionCtor();recognition.lang=languageCode();recognition.interimResults=false;recognition.maxAlternatives=1;
  recognition.onstart=()=>{$('listenBtn').disabled=true;$('stopBtn').disabled=false;status('듣고 있어요. 편하게 말해 보세요.');};
  recognition.onresult=(event)=>{const heard=event.results?.[0]?.[0]?.transcript||'';if(heard)ask(heard);};
  recognition.onerror=(event)=>{status(event.error==='not-allowed'?'마이크 권한을 허용해 주세요.':'잘 듣지 못했어요. 다시 말해 볼까요?');$('listenBtn').disabled=false;$('stopBtn').disabled=true;};
  recognition.onend=()=>{$('listenBtn').disabled=false;$('stopBtn').disabled=true;};
  try{recognition.start();}catch{status('음성 인식을 시작할 수 없어요.');}
});
$('stopBtn').addEventListener('click',()=>{if(recognition){try{recognition.abort();}catch{}}stopListening();status('음성 입력을 멈췄어요.');});
$('sendBtn').addEventListener('click',()=>{const input=$('message');const value=input.value;input.value='';ask(value);input.focus();});
$('message').addEventListener('keydown',(event)=>{if(event.key==='Enter')$('sendBtn').click();});
$('language').addEventListener('change',()=>{if(recognition)recognition.lang=languageCode();});

// Camera tracking is optional and local to this browser; frames are not sent to the app server or Gemini.
$('cameraBtn').addEventListener('click',async()=>{
  const button=$('cameraBtn');if(!hasConsent())return;
  if(cameraStream){cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null;faceTask=null;cancelAnimationFrame(animationFrame);$('camera').srcObject=null;button.textContent='📷 얼굴 따라가기';button.setAttribute('aria-pressed','false');status('얼굴 따라가기를 껐어요.');return;}
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});const video=$('camera');video.srcObject=cameraStream;await video.play();
    button.textContent='⏹ 얼굴 추적 끄기';button.setAttribute('aria-pressed','true');status('카메라 영상은 이 기기 안에서 처리돼요.');
    const vision=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm');
    const files=await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
    faceTask=await vision.FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:1});
    const track=()=>{if(!cameraStream||!faceTask)return;if(video.readyState>=2){const face=faceTask.detectForVideo(video,performance.now()).faceLandmarks?.[0]?.[1];if(face){const x=Math.max(-4,Math.min(4,(face.x-.5)*-20)),y=Math.max(-4,Math.min(4,(face.y-.45)*-20));$('pupilL').setAttribute('transform',`translate(${x} ${y})`);$('pupilR').setAttribute('transform',`translate(${x} ${y})`);}}animationFrame=requestAnimationFrame(track);};track();
  }catch{if(cameraStream)cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null;$('camera').srcObject=null;button.textContent='📷 얼굴 따라가기';button.setAttribute('aria-pressed','false');status('카메라 권한과 HTTPS 연결, 얼굴 추적 모델 다운로드를 확인해 주세요.');}
});
window.addEventListener('pagehide',()=>{if(recognition){try{recognition.abort();}catch{}}window.speechSynthesis?.cancel();clearMouthAnimation();if(cameraStream)cameraStream.getTracks().forEach(track=>track.stop());});

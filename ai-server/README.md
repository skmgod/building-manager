# 건물관리 AI 연결 (제미나이 · 그록 · 클로드)

AI에게 말하면 건물관리 앱의 **청구 목록**에 민원이 들어가도록 하는 중간 서버 설정입니다. 무료 Cloudflare Worker를 씁니다.

## 1. 비밀키 정하기
아무도 모르는 긴 글자(30자 이상)를 정해서 메모장에 보관하세요. 예: `b7Qk2mZ9xR4wLp8sVn3dYc6hBj1eGf5a`

## 2. Cloudflare에 서버 만들기
1. https://dash.cloudflare.com 에서 가입(무료)
2. **Storage & Databases → Workers KV → Create a namespace** → 이름 `buildingmgr`
3. **Workers & Pages → Create → Start with Hello World** → 이름 `building-mcp` → Deploy
4. **Edit code** → 안의 내용을 모두 지우고 이 폴더의 `worker.js` 내용을 붙여넣기 → Deploy
5. **Settings → Variables and Secrets**
   - Add → 타입 **Secret**, 이름 `SECRET`, 값 = 1번 비밀키
   - Bindings → Add → **KV namespace**, Variable name `KV`, namespace `buildingmgr`
6. **Deploy** 한 번 더 누르기

## 3. 주소 만들기
Worker 화면 위쪽 주소(예: `https://building-mcp.내이름.workers.dev`)에 아래를 붙입니다.

| 용도 | 주소 |
|---|---|
| AI 연결용 | `…/mcp/비밀키` |
| 건물관리 앱 가져오기용 | `…/inbox/비밀키` |

## 4. AI에 연결하기
- **그록**: https://grok.com/connectors → New Connector → Custom → AI 연결용 주소
- **클로드**: claude.ai → 설정 → 커넥터 → 커스텀 커넥터 추가 → AI 연결용 주소
- **제미나이**: 연결된 앱 → 사용자 지정 앱 추가 (메뉴가 없으면 지원 여부를 확인해야 해요)

AI에게 이렇게 말하면 됩니다.
> "행복빌라 301호 전화 010-1234-5678 화장실 변기 물이 안 내려가요, 오후 3시 이후 방문 가능 건물관리에 넣어줘"

## 5. 건물관리 앱에 연결하기
앱 상단의 **⚙** 버튼 → 보관함 주소(`/inbox/` 로 끝나는 것) 붙여넣기. 앱을 열면 새 민원을 자동으로 가져옵니다.

## 주의
- 비밀키와 주소는 남에게 보여주지 마세요.
- 비밀키가 새어 나갔다면 `SECRET` 값을 새 글자로 바꾸고 AI 연결과 앱 주소를 다시 넣으세요.

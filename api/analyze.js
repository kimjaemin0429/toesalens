// 파일: api/analyze.js (Vercel Serverless Function)
// Firebase 설정과 Claude API를 통합한 분석 함수

import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { 
            salary, 
            monthlyIncome, 
            savings, 
            monthlyExpense, 
            debt, 
            experience, 
            currentRole, 
            companySize, 
            stressLevel,
            promptVersion = 'v1',
            temperature = 0.3,
            weights = { survival: 40, career: 40, stress: 20 },
            promptText = null
        } = req.body;

        // 입력값 검증
        if (!salary || !monthlyIncome || !monthlyExpense || !experience || !currentRole || !companySize || !stressLevel) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 사용자 데이터 포맷팅
        const userData = `
- 연봉: ${salary}만원
- 월 실수령액: ${monthlyIncome}만원
- 비상금: ${savings}만원
- 월 고정지출: ${monthlyExpense}만원
- 대출금: ${debt}만원
- 경력 연차: ${experience}
- 현재 직무: ${currentRole}
- 회사 규모: ${companySize}
- 스트레스 수준: ${stressLevel}`;

        // 기본 프롬프트
        const defaultPrompt = `당신은 경제 전문가이자 커리어 컨설턴트입니다. 다음 사용자의 정보를 바탕으로 "퇴사 가능성"을 분석하고, JSON 형식으로 정확한 결과만 반환해주세요.

[사용자 정보]${userData}

[분석 항목]
1. 퇴사 추천 점수 (0~100점)
   - 생존 자금력 가중치: ${weights.survival}%
   - 커리어 시장성 가중치: ${weights.career}%
   - 스트레스 수준 가중치: ${weights.stress}%

2. 생존 가능 기간 (개월)
   - (비상금 - 대출금) / 월 고정지출

3. 예상 재취업 기간 (개월)
   - 직무별 평균 기준

[응답 형식]
다음 JSON으로만 응답:
\`\`\`json
{
  "score": 75,
  "scoreDescription": "퇴사 가능 안정권",
  "survivalMonths": 6.4,
  "survivalDescription": "6개월 이상 생활 가능",
  "rehireMonths": 3,
  "rehireDescription": "개발 직군 평균"
}
\`\`\``;

        // 최종 프롬프트
        const finalPrompt = promptText ? promptText.replace('{{userData}}', userData) : defaultPrompt;

        // Claude API 초기화
        const client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });

        // Claude API 호출
        const message = await client.messages.create({
            model: 'claude-opus-4-1-20250805',
            max_tokens: 500,
            temperature: temperature,
            messages: [
                {
                    role: 'user',
                    content: finalPrompt
                }
            ]
        });

        // 응답 파싱
        const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
        
        // JSON 추출
        let jsonStr = responseText;
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        } else {
            const cleanedText = responseText.trim();
            const startIdx = cleanedText.indexOf('{');
            const endIdx = cleanedText.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1) {
                jsonStr = cleanedText.substring(startIdx, endIdx + 1);
            }
        }

        const result = JSON.parse(jsonStr);

        // 최종 결과
        const finalResult = {
            score: Math.min(Math.max(result.score || 50, 0), 100),
            scoreDescription: result.scoreDescription || '분석 완료',
            survivalMonths: Math.round((result.survivalMonths || 0) * 10) / 10,
            survivalDescription: result.survivalDescription || '재무 상황을 확인하세요',
            rehireMonths: result.rehireMonths || 3,
            rehireDescription: result.rehireDescription || '업계 평균 기준'
        };

        return res.status(200).json(finalResult);

    } catch (error) {
        console.error('Analysis error:', error);
        return res.status(500).json({
            error: error.message || 'Analysis failed',
            score: 50,
            scoreDescription: '일시적 오류가 발생했습니다',
            survivalMonths: 0,
            survivalDescription: '다시 시도해주세요',
            rehireMonths: 0,
            rehireDescription: '오류'
        });
    }
}

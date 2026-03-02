import { Diary, Conversation, Message } from '../types';

const now = new Date();
const day = (daysAgo: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

export const mockDiaries: Diary[] = [
  {
    id: 1,
    user_id: 1,
    title_original: null,
    title_translated: null,
    original_text: '오늘 팀장님과 프로젝트 일정에 대해 회의했다. 다음 주까지 마감이라 좀 빡세지만, 잘 해낼 수 있을 것 같다.',
    translated_text: 'Today I had a meeting with my team leader about the project schedule. The deadline is next week, so it\'s going to be tight, but I think we can pull it off.',
    status: 'completed',
    task_id: null,
    learning_cards: [
      { id: 1, card_type: 'phrase', content_en: 'pull it off', origin_from: 'pull it off', audio_url: null, example_audio_url: null, content_ko: '해내다, 성공하다', example_en: 'I think we can pull it off if we work together.', example_ko: '함께하면 해낼 수 있을 거야.', cefr_level: 'B1', part_of_speech: 'phrasal verb', card_order: 0 },
      { id: 2, card_type: 'word', content_en: 'deadline', origin_from: 'deadline', audio_url: null, example_audio_url: null, content_ko: '마감일', example_en: 'The deadline for the report is next Friday.', example_ko: '보고서 마감일은 다음 주 금요일이야.', cefr_level: 'A2', part_of_speech: 'noun', card_order: 1 },
      { id: 3, card_type: 'sentence', content_en: 'It\'s going to be tight', origin_from: null, audio_url: null, example_audio_url: null, content_ko: '빡빡할 거야', example_en: 'We have a lot to do — it\'s going to be tight.', example_ko: '할 일이 많아서 빡빡할 거야.', cefr_level: 'B1', part_of_speech: null, card_order: 2 },
    ],
    created_at: day(0),
    updated_at: day(0),
    completed_at: day(0),
  },
  {
    id: 2,
    user_id: 1,
    title_original: null,
    title_translated: null,
    original_text: '오랜만에 대학 친구를 만나서 카페에서 수다를 떨었다. 요즘 서로 바빠서 자주 못 만나는데 오늘 정말 즐거웠다.',
    translated_text: 'I met up with a college friend at a café after a long time. We\'ve both been busy lately so we haven\'t been able to meet often, but today was really enjoyable.',
    status: 'learning_done',
    task_id: null,
    learning_cards: [
      { id: 4, card_type: 'phrase', content_en: 'meet up with', origin_from: 'met up with', audio_url: null, example_audio_url: null, content_ko: '~와 만나다', example_en: 'Let\'s meet up with the others after work.', example_ko: '퇴근 후에 다른 사람들과 만나자.', cefr_level: 'A2', part_of_speech: 'phrasal verb', card_order: 0 },
      { id: 5, card_type: 'word', content_en: 'enjoyable', origin_from: 'enjoyable', audio_url: null, example_audio_url: null, content_ko: '즐거운', example_en: 'The trip was very enjoyable.', example_ko: '여행이 매우 즐거웠다.', cefr_level: 'A2', part_of_speech: 'adjective', card_order: 1 },
    ],
    created_at: day(1),
    updated_at: day(1),
    completed_at: day(1),
  },
  {
    id: 3,
    user_id: 1,
    title_original: null,
    title_translated: null,
    original_text: '하루 종일 비가 와서 집에서 넷플릭스를 보며 쉬었다. 가끔은 이런 날도 필요한 것 같다.',
    translated_text: 'It rained all day so I stayed home and relaxed watching Netflix. I think we all need days like this sometimes.',
    status: 'completed',
    task_id: null,
    learning_cards: [
      { id: 6, card_type: 'word', content_en: 'relax', origin_from: 'relaxed', audio_url: null, example_audio_url: null, content_ko: '쉬다, 긴장을 풀다', example_en: 'I like to relax on the couch after work.', example_ko: '퇴근 후에 소파에서 쉬는 걸 좋아해.', cefr_level: 'A1', part_of_speech: 'verb', card_order: 0 },
    ],
    created_at: day(3),
    updated_at: day(3),
    completed_at: day(3),
  },
  {
    id: 4,
    user_id: 1,
    title_original: null,
    title_translated: null,
    original_text: '유튜브에서 본 파스타 레시피를 따라 해봤다. 생각보다 어려웠지만 맛은 괜찮았다.',
    translated_text: 'I tried following a pasta recipe I saw on YouTube. It was harder than I expected, but it turned out okay.',
    status: 'completed',
    task_id: null,
    learning_cards: [
      { id: 7, card_type: 'phrase', content_en: 'turn out', origin_from: 'turned out', audio_url: null, example_audio_url: null, content_ko: '결과가 ~하다', example_en: 'The party turned out to be a great success.', example_ko: '파티는 대성공이었다.', cefr_level: 'B1', part_of_speech: 'phrasal verb', card_order: 0 },
      { id: 8, card_type: 'word', content_en: 'recipe', origin_from: 'recipe', audio_url: null, example_audio_url: null, content_ko: '레시피, 조리법', example_en: 'This is my grandmother\'s secret recipe.', example_ko: '이건 할머니의 비밀 레시피야.', cefr_level: 'A2', part_of_speech: 'noun', card_order: 1 },
    ],
    created_at: day(3),
    updated_at: day(3),
    completed_at: day(3),
  },
  {
    id: 5,
    user_id: 1,
    title_original: null,
    title_translated: null,
    original_text: '날씨가 좋아서 한강공원에서 산책했다. 벚꽃이 피기 시작해서 너무 예뻤다.',
    translated_text: 'The weather was nice so I went for a walk at Hangang Park. The cherry blossoms were starting to bloom and it was beautiful.',
    status: 'learning_done',
    task_id: null,
    learning_cards: [
      { id: 9, card_type: 'word', content_en: 'bloom', origin_from: 'bloom', audio_url: null, example_audio_url: null, content_ko: '피다, 꽃이 피다', example_en: 'The flowers bloom every spring.', example_ko: '꽃은 매년 봄에 핀다.', cefr_level: 'B1', part_of_speech: 'verb', card_order: 0 },
      { id: 10, card_type: 'phrase', content_en: 'go for a walk', origin_from: 'went for a walk', audio_url: null, example_audio_url: null, content_ko: '산책하다', example_en: 'Let\'s go for a walk after dinner.', example_ko: '저녁 후에 산책하자.', cefr_level: 'A1', part_of_speech: 'phrase', card_order: 1 },
    ],
    created_at: day(5),
    updated_at: day(5),
    completed_at: day(5),
  },
  {
    id: 6,
    user_id: 1,
    title_original: null,
    title_translated: null,
    original_text: '버그 때문에 야근했다. 결국 원인을 찾아서 해결했지만 정말 피곤하다.',
    translated_text: 'I had to work overtime because of a bug. I finally found the cause and fixed it, but I\'m really exhausted.',
    status: 'completed',
    task_id: null,
    learning_cards: [
      { id: 11, card_type: 'word', content_en: 'overtime', origin_from: 'overtime', audio_url: null, example_audio_url: null, content_ko: '초과 근무', example_en: 'I worked overtime three days this week.', example_ko: '이번 주에 3일 야근했다.', cefr_level: 'A2', part_of_speech: 'noun', card_order: 0 },
      { id: 12, card_type: 'word', content_en: 'exhausted', origin_from: 'exhausted', audio_url: null, example_audio_url: null, content_ko: '기진맥진한', example_en: 'After the marathon, I was completely exhausted.', example_ko: '마라톤 후에 완전히 지쳤다.', cefr_level: 'B1', part_of_speech: 'adjective', card_order: 1 },
    ],
    created_at: day(7),
    updated_at: day(7),
    completed_at: day(7),
  },
  {
    id: 7,
    user_id: 1,
    title_original: null,
    title_translated: null,
    original_text: '오랜만에 가족들과 외식을 했다. 부모님이 좋아하시는 한정식집에 갔는데 역시 맛있었다.',
    translated_text: 'I went out to eat with my family for the first time in a while. We went to a traditional Korean restaurant that my parents love, and it was delicious as always.',
    status: 'learning_done',
    task_id: null,
    learning_cards: [
      { id: 13, card_type: 'phrase', content_en: 'for the first time in a while', origin_from: null, audio_url: null, example_audio_url: null, content_ko: '오랜만에', example_en: 'I saw an old friend for the first time in a while.', example_ko: '오랜만에 옛 친구를 만났다.', cefr_level: 'B1', part_of_speech: 'phrase', card_order: 0 },
    ],
    created_at: day(10),
    updated_at: day(10),
    completed_at: day(10),
  },
  {
    id: 8,
    user_id: 1,
    title_original: null,
    title_translated: null,
    original_text: '오늘부터 헬스장에 다니기 시작했다. 처음이라 힘들었지만 기분은 좋았다.',
    translated_text: 'I started going to the gym today. It was tough since it was my first time, but I felt good afterwards.',
    status: 'completed',
    task_id: null,
    learning_cards: [
      { id: 14, card_type: 'word', content_en: 'tough', origin_from: 'tough', audio_url: null, example_audio_url: null, content_ko: '힘든, 어려운', example_en: 'The exam was really tough.', example_ko: '시험이 정말 어려웠다.', cefr_level: 'A2', part_of_speech: 'adjective', card_order: 0 },
      { id: 15, card_type: 'phrase', content_en: 'felt good afterwards', origin_from: null, audio_url: null, example_audio_url: null, content_ko: '끝나고 기분이 좋았다', example_en: 'I was tired, but I felt good afterwards.', example_ko: '피곤했지만 끝나고 기분이 좋았다.', cefr_level: 'B1', part_of_speech: 'phrase', card_order: 1 },
    ],
    created_at: day(14),
    updated_at: day(14),
    completed_at: day(14),
  },
];

export const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    userId: '1',
    status: 'completed',
    turnCount: 6,
    maxTurns: 10,
    createdAt: day(0),
    updatedAt: day(0),
  },
];

export const mockMessages: Message[] = [
  { id: 'm-1', conversationId: 'conv-1', role: 'assistant', content: '오늘 하루 어땠어?', createdAt: day(0) },
  { id: 'm-2', conversationId: 'conv-1', role: 'user', content: '회사에서 회의했어', createdAt: day(0) },
  { id: 'm-3', conversationId: 'conv-1', role: 'assistant', content: '어떤 회의였어? 누구랑 했어?', createdAt: day(0) },
  { id: 'm-4', conversationId: 'conv-1', role: 'user', content: '팀장님이랑 프로젝트 일정 잡았어', createdAt: day(0) },
  { id: 'm-5', conversationId: 'conv-1', role: 'assistant', content: '결과는 어땠어?', createdAt: day(0) },
  { id: 'm-6', conversationId: 'conv-1', role: 'user', content: '다음주까지 마감이래 좀 빡세', createdAt: day(0) },
];

// Mock messages indexed by conversation ID for quick lookup
export const mockMessagesByConversation: Record<string, Message[]> = {
  'conv-1': mockMessages,
  'conv-2': [
    { id: 'm-20', conversationId: 'conv-2', role: 'assistant', content: '오늘 하루 어땠어?', createdAt: day(1) },
    { id: 'm-21', conversationId: 'conv-2', role: 'user', content: '대학 친구 만났어', createdAt: day(1) },
    { id: 'm-22', conversationId: 'conv-2', role: 'assistant', content: '어디서 만났어? 뭐 했어?', createdAt: day(1) },
    { id: 'm-23', conversationId: 'conv-2', role: 'user', content: '카페에서 수다 떨었어. 오랜만에 만나서 좋았어.', createdAt: day(1) },
  ],
  'conv-3': [
    { id: 'm-30', conversationId: 'conv-3', role: 'assistant', content: '오늘 뭐 했어?', createdAt: day(3) },
    { id: 'm-31', conversationId: 'conv-3', role: 'user', content: '비가 와서 집에 있었어', createdAt: day(3) },
    { id: 'm-32', conversationId: 'conv-3', role: 'assistant', content: '집에서 뭐 하면서 보냈어?', createdAt: day(3) },
    { id: 'm-33', conversationId: 'conv-3', role: 'user', content: '넷플릭스 봤어. 가끔 이런 날도 필요해.', createdAt: day(3) },
  ],
};

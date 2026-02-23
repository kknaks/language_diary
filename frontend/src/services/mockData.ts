import { Diary, Conversation, Message } from '../types';

const now = new Date();
const day = (daysAgo: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

export const mockDiaries: Diary[] = [
  {
    id: '1',
    userId: '1',
    titleKo: '팀 회의와 프로젝트 마감',
    titleEn: 'Team Meeting and Project Deadline',
    contentKo: '오늘 팀장님과 프로젝트 일정에 대해 회의했다. 다음 주까지 마감이라 좀 빡세지만, 잘 해낼 수 있을 것 같다.',
    contentEn: 'Today I had a meeting with my team leader about the project schedule. The deadline is next week, so it\'s going to be tight, but I think we can pull it off.',
    status: 'completed',
    conversationId: 'conv-1',
    learningCards: [
      { id: 'lc-1', type: 'phrase', english: 'pull it off', korean: '해내다, 성공하다', example: 'I think we can pull it off if we work together.', cefrLevel: 'B1', partOfSpeech: 'phrasal verb' },
      { id: 'lc-2', type: 'word', english: 'deadline', korean: '마감일', example: 'The deadline for the report is next Friday.', cefrLevel: 'A2', partOfSpeech: 'noun' },
      { id: 'lc-3', type: 'sentence', english: 'It\'s going to be tight', korean: '빡빡할 거야', example: 'We have a lot to do — it\'s going to be tight.', cefrLevel: 'B1' },
    ],
    createdAt: day(0),
    updatedAt: day(0),
  },
  {
    id: '2',
    userId: '1',
    titleKo: '친구와 카페에서',
    titleEn: 'At a Café with a Friend',
    contentKo: '오랜만에 대학 친구를 만나서 카페에서 수다를 떨었다. 요즘 서로 바빠서 자주 못 만나는데 오늘 정말 즐거웠다.',
    contentEn: 'I met up with a college friend at a café after a long time. We\'ve both been busy lately so we haven\'t been able to meet often, but today was really enjoyable.',
    status: 'learning_done',
    conversationId: 'conv-2',
    learningCards: [
      { id: 'lc-4', type: 'phrase', english: 'meet up with', korean: '~와 만나다', example: 'Let\'s meet up with the others after work.', cefrLevel: 'A2', partOfSpeech: 'phrasal verb' },
      { id: 'lc-5', type: 'word', english: 'enjoyable', korean: '즐거운', example: 'The trip was very enjoyable.', cefrLevel: 'A2', partOfSpeech: 'adjective' },
    ],
    createdAt: day(1),
    updatedAt: day(1),
  },
  {
    id: '3',
    userId: '1',
    titleKo: '비 오는 날 집에서',
    titleEn: 'A Rainy Day at Home',
    contentKo: '하루 종일 비가 와서 집에서 넷플릭스를 보며 쉬었다. 가끔은 이런 날도 필요한 것 같다.',
    contentEn: 'It rained all day so I stayed home and relaxed watching Netflix. I think we all need days like this sometimes.',
    status: 'completed',
    conversationId: 'conv-3',
    learningCards: [
      { id: 'lc-6', type: 'word', english: 'relax', korean: '쉬다, 긴장을 풀다', example: 'I like to relax on the couch after work.', cefrLevel: 'A1', partOfSpeech: 'verb' },
    ],
    createdAt: day(3),
    updatedAt: day(3),
  },
  {
    id: '4',
    userId: '1',
    titleKo: '새로운 요리에 도전',
    titleEn: 'Trying a New Recipe',
    contentKo: '유튜브에서 본 파스타 레시피를 따라 해봤다. 생각보다 어려웠지만 맛은 괜찮았다.',
    contentEn: 'I tried following a pasta recipe I saw on YouTube. It was harder than I expected, but it turned out okay.',
    status: 'completed',
    conversationId: 'conv-4',
    learningCards: [
      { id: 'lc-7', type: 'phrase', english: 'turn out', korean: '결과가 ~하다', example: 'The party turned out to be a great success.', cefrLevel: 'B1', partOfSpeech: 'phrasal verb' },
      { id: 'lc-8', type: 'word', english: 'recipe', korean: '레시피, 조리법', example: 'This is my grandmother\'s secret recipe.', cefrLevel: 'A2', partOfSpeech: 'noun' },
    ],
    createdAt: day(3),
    updatedAt: day(3),
  },
  {
    id: '5',
    userId: '1',
    titleKo: '주말 산책',
    titleEn: 'Weekend Walk',
    contentKo: '날씨가 좋아서 한강공원에서 산책했다. 벚꽃이 피기 시작해서 너무 예뻤다.',
    contentEn: 'The weather was nice so I went for a walk at Hangang Park. The cherry blossoms were starting to bloom and it was beautiful.',
    status: 'learning_done',
    conversationId: 'conv-5',
    learningCards: [
      { id: 'lc-9', type: 'word', english: 'bloom', korean: '피다, 꽃이 피다', example: 'The flowers bloom every spring.', cefrLevel: 'B1', partOfSpeech: 'verb' },
      { id: 'lc-10', type: 'phrase', english: 'go for a walk', korean: '산책하다', example: 'Let\'s go for a walk after dinner.', cefrLevel: 'A1', partOfSpeech: 'phrase' },
    ],
    createdAt: day(5),
    updatedAt: day(5),
  },
  {
    id: '6',
    userId: '1',
    titleKo: '야근하는 날',
    titleEn: 'Working Late',
    contentKo: '버그 때문에 야근했다. 결국 원인을 찾아서 해결했지만 정말 피곤하다.',
    contentEn: 'I had to work overtime because of a bug. I finally found the cause and fixed it, but I\'m really exhausted.',
    status: 'completed',
    conversationId: 'conv-6',
    learningCards: [
      { id: 'lc-11', type: 'word', english: 'overtime', korean: '초과 근무', example: 'I worked overtime three days this week.', cefrLevel: 'A2', partOfSpeech: 'noun' },
      { id: 'lc-12', type: 'word', english: 'exhausted', korean: '기진맥진한', example: 'After the marathon, I was completely exhausted.', cefrLevel: 'B1', partOfSpeech: 'adjective' },
    ],
    createdAt: day(7),
    updatedAt: day(7),
  },
  {
    id: '7',
    userId: '1',
    titleKo: '가족 저녁 식사',
    titleEn: 'Family Dinner',
    contentKo: '오랜만에 가족들과 외식을 했다. 부모님이 좋아하시는 한정식집에 갔는데 역시 맛있었다.',
    contentEn: 'I went out to eat with my family for the first time in a while. We went to a traditional Korean restaurant that my parents love, and it was delicious as always.',
    status: 'learning_done',
    conversationId: 'conv-7',
    learningCards: [
      { id: 'lc-13', type: 'phrase', english: 'for the first time in a while', korean: '오랜만에', example: 'I saw an old friend for the first time in a while.', cefrLevel: 'B1', partOfSpeech: 'phrase' },
    ],
    createdAt: day(10),
    updatedAt: day(10),
  },
  {
    id: '8',
    userId: '1',
    titleKo: '운동 시작',
    titleEn: 'Starting to Exercise',
    contentKo: '오늘부터 헬스장에 다니기 시작했다. 처음이라 힘들었지만 기분은 좋았다.',
    contentEn: 'I started going to the gym today. It was tough since it was my first time, but I felt good afterwards.',
    status: 'completed',
    conversationId: 'conv-8',
    learningCards: [
      { id: 'lc-14', type: 'word', english: 'tough', korean: '힘든, 어려운', example: 'The exam was really tough.', cefrLevel: 'A2', partOfSpeech: 'adjective' },
      { id: 'lc-15', type: 'phrase', english: 'felt good afterwards', korean: '끝나고 기분이 좋았다', example: 'I was tired, but I felt good afterwards.', cefrLevel: 'B1', partOfSpeech: 'phrase' },
    ],
    createdAt: day(14),
    updatedAt: day(14),
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

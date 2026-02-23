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
];

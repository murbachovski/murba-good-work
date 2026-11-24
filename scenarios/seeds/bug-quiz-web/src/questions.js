var QUESTIONS = [
  { text: '대한민국의 수도는?', choices: ['부산', '서울', '대전'], answer: 1 },
  { text: '3의 배수를 모두 고르세요', choices: ['3', '4', '6', '9'], answer: [0, 2, 3], multi: true },
  { text: '물의 끓는점(섭씨)은?', choices: ['90', '100', '110'], answer: 1 },
];
if (typeof module !== 'undefined') module.exports = { QUESTIONS };

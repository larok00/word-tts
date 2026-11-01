/** splitter-cases fixtures/checks for the add-in. No public exports except cases.
 * Node test support; integration fixtures avoid requiring Word or live speech.
 */
// Shared expected boundaries, also emitted into the Bend suite.
export default [
  ['simple', 'Hello. World.', 100, ['Hello. ', 'World.']],
  ['titles', 'Mr. Smith met Dr. Jones. Bye.', 100, ['Mr. Smith met Dr. Jones. ', 'Bye.']],
  [
    'examples',
    'Use e.g. apples and i.e. fruit. Next.',
    100,
    ['Use e.g. apples and i.e. fruit. ', 'Next.'],
  ],
  ['initials', 'J. K. Rowling wrote. Next.', 100, ['J. K. Rowling wrote. ', 'Next.']],
  [
    'numbers',
    'Pay 1,000.50 for 3.14 pies in v2.0. Done.',
    100,
    ['Pay 1,000.50 for 3.14 pies in v2.0. ', 'Done.'],
  ],
  ['ellipsis_upper', 'Wait... Next.', 100, ['Wait... ', 'Next.']],
  ['ellipsis_lower', 'Wait... maybe later.', 100, ['Wait... maybe later.']],
  ['unicode_ellipsis', 'Wait… Next… maybe.', 100, ['Wait… ', 'Next… maybe.']],
  ['ellipsis_end', 'Wait...', 100, ['Wait...']],
  ['quotes', 'He said "Hi." Then left.', 100, ['He said "Hi." ', 'Then left.']],
  ['closers', 'Hi!’) Next.', 100, ['Hi!’) ', 'Next.']],
  ['bang_question', 'Really? Yes! Fine.', 100, ['Really? ', 'Yes! ', 'Fine.']],
  ['paragraph', 'One\n\nTwo', 100, ['One\n\n', 'Two']],
  ['newline', 'One\nTwo', 100, ['One\n', 'Two']],
  ['carriage', 'One\rTwo', 100, ['One\r', 'Two']],
  ['crlf', 'One\r\n\r\nTwo', 100, ['One\r\n\r\n', 'Two']],
  ['forced', 'alpha beta gamma delta', 11, ['alpha beta ', 'gamma delta']],
  ['hard', 'abcdefghij', 3, ['abc', 'def', 'ghi', 'j']],
  ['empty', '', 100, []],
  ['unfinished', 'text without punctuation', 100, ['text without punctuation']],
  ['whitespace', '  Hi. \n  Bye.  ', 100, ['  Hi. \n  ', 'Bye.  ']],
  ['all_whitespace', ' \n\r ', 100, [' \n\r ']],
  ['max_one', 'A. B', 1, ['A', '.', ' ', 'B']],
  [
    'all_abbreviations',
    'Mrs. Ms. Prof. Sr. Jr. St. vs. etc. No. Fig. approx. done. Next.',
    100,
    ['Mrs. Ms. Prof. Sr. Jr. St. vs. etc. No. Fig. approx. done. ', 'Next.'],
  ],
  ['unicode', '😀 Hello. 世界!', 100, ['😀 Hello. ', '世界!']],
  ['space_at_limit', 'abcd efgh', 5, ['abcd ', 'efgh']],
  ['trailing_long_space', 'Hi.      ', 4, ['Hi. ', '    ', ' ']],
];

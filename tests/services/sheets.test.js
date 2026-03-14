// tests/services/sheets.test.js
const { fetchSheet, appendRow } = require('../../src/services/sheets');

// Mock googleapis
jest.mock('googleapis', () => {
  const mockGet = jest.fn();
  const mockAppend = jest.fn();
  return {
    google: {
      auth: {
        GoogleAuth: jest.fn().mockImplementation(() => ({})),
      },
      sheets: jest.fn().mockReturnValue({
        spreadsheets: {
          values: {
            get: mockGet,
            append: mockAppend,
          },
        },
      }),
    },
    __mockGet: mockGet,
    __mockAppend: mockAppend,
  };
});

const { __mockGet, __mockAppend } = require('googleapis');

describe('sheets', () => {
  beforeEach(() => jest.clearAllMocks());

  test('fetchSheet returns rows as objects using header row', async () => {
    __mockGet.mockResolvedValue({
      data: {
        values: [
          ['id', 'name_ar', 'zone', 'status'],
          ['1', 'ملجأ الحمرا', 'الحمرا', 'open'],
          ['2', 'ملجأ صيدا', 'صيدا', 'full'],
        ],
      },
    });
    const rows = await fetchSheet('shelters');
    expect(rows).toEqual([
      { id: '1', name_ar: 'ملجأ الحمرا', zone: 'الحمرا', status: 'open' },
      { id: '2', name_ar: 'ملجأ صيدا', zone: 'صيدا', status: 'full' },
    ]);
  });

  test('fetchSheet returns empty array when no data rows', async () => {
    __mockGet.mockResolvedValue({
      data: { values: [['id', 'name_ar']] },
    });
    const rows = await fetchSheet('shelters');
    expect(rows).toEqual([]);
  });

  test('fetchSheet filters out rows where needs_review is TRUE', async () => {
    __mockGet.mockResolvedValue({
      data: {
        values: [
          ['id', 'name_ar', 'needs_review'],
          ['1', 'verified', 'FALSE'],
          ['2', 'unverified', 'TRUE'],
        ],
      },
    });
    const rows = await fetchSheet('shelters');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('1');
  });

  test('appendRow appends a row to the sheet', async () => {
    __mockAppend.mockResolvedValue({});
    await appendRow('aid_requests', { id: '1', name: 'Ahmad', zone: 'Hamra' });
    expect(__mockAppend).toHaveBeenCalled();
  });
});

import { JsonTemplateProcessor } from '../utils/jsonTemplateProcessor';
import { Logger } from '../utils/logger';

describe('JsonTemplateProcessor - join function', () => {
  let processor: JsonTemplateProcessor;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      setLevel: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      isDebugEnabled: jest.fn().mockReturnValue(true),
      isInfoEnabled: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<Logger>;
    processor = new JsonTemplateProcessor(mockLogger);
  });

  it('should join array with space separator', () => {
    const template = 'Tags: {{tags|join: }}';
    const data = { tags: ['tag1', 'tag2', 'tag3'] };
    
    const result = processor.applyTemplate(template, data);
    
    expect(result).toBe('Tags: tag1tag2tag3');
  });

  it('should join array with space separator and hashtag prefix', () => {
    const template = 'Tags: {{tags|join: ,#}}';
    const data = { tags: ['tag1', 'tag2', 'tag3'] };
    
    const result = processor.applyTemplate(template, data);
    
    expect(result).toBe('Tags: #tag1 #tag2 #tag3');
  });

  it('should join array with hashtag separator and hashtag prefix', () => {
    const template = 'Tags: {{tags|join:#,#}}';
    const data = { tags: ['tag1', 'tag2', 'tag3'] };
    
    const result = processor.applyTemplate(template, data);
    
    expect(result).toBe('Tags: #tag1##tag2##tag3');
  });

  it('should join array with space-hashtag separator and hashtag prefix', () => {
    const template = 'Tags: {{tags|join: #,#}}';
    const data = { tags: ['tag1', 'tag2', 'tag3'] };
    
    const result = processor.applyTemplate(template, data);
    
    expect(result).toBe('Tags: #tag1 ##tag2 ##tag3');
  });

  it('should handle empty array', () => {
    const template = 'Tags: {{tags|join: ,#}}';
    const data = { tags: [] };
    
    const result = processor.applyTemplate(template, data);
    
    expect(result).toBe('Tags: ');
  });

  it('should warn when trying to join non-array', () => {
    const template = 'Tags: {{notArray|join: ,#}}';
    const data = { notArray: 'string' };
    
    const result = processor.applyTemplate(template, data);
    
    expect(result).toBe('Tags: string');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'join function can only be applied to arrays, but variable "notArray" is not an array'
    );
  });

  it('should work with Twitch tags example', () => {
    const template = '🎮 {{streamer_name}} ist live: {{tags|join: ,#}}';
    const data = {
      streamer_name: 'isolani44',
      tags: ['Deutsch', 'Road2CM', 'Österreich', 'Schwammerl', 'test']
    };
    
    const result = processor.applyTemplate(template, data);
    
    expect(result).toBe('🎮 isolani44 ist live: #Deutsch #Road2CM #Österreich #Schwammerl #test');
  });

  it('should handle undefined tags with join function', () => {
    const template = 'Tags: {{tags|join: ,#}}';
    const data = {}; // tags is undefined
    
    const result = processor.applyTemplate(template, data);
    
    expect(result).toBe('Tags: ');
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'join function: treating null/undefined variable "tags" as empty array'
    );
  });

  it('should handle null tags with join function', () => {
    const template = 'Tags: {{tags|join: ,#}}';
    const data = { tags: null };
    
    const result = processor.applyTemplate(template, data);
    
    expect(result).toBe('Tags: ');
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'join function: treating null/undefined variable "tags" as empty array'
    );
  });

  it('should handle real-world Twitch example with undefined tags', () => {
    const template = '🎮♟️ {{streamer_name}} is going live at {{url}} with {{stream_title}}. ({{followers_count}} Followers) {{tags|join: ,#}}';
    const data = {
      streamer_name: 'Elaynah',
      url: 'https://twitch.tv/elaynah',
      stream_title: 'Chess Climb 🧩 Tactics | !Bloom !YouTube !x !shorts !TikTok',
      followers_count: '24433'
      // tags is undefined
    };
    
    const result = processor.applyTemplate(template, data);
    
    expect(result).toBe('🎮♟️ Elaynah is going live at https://twitch.tv/elaynah with Chess Climb 🧩 Tactics | !Bloom !YouTube !x !shorts !TikTok. (24433 Followers) ');
  });
});
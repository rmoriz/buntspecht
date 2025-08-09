import { UrlTrackingMiddleware } from '../../services/middleware/builtin/UrlTrackingMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';

describe('UrlTrackingMiddleware', () => {
  let logger: Logger;
  let telemetry: TelemetryService;
  let context: MessageMiddlewareContext;

  beforeEach(() => {
    jest.restoreAllMocks(); // Ensure clean state for each test
    
    logger = new Logger('debug');
    telemetry = new TelemetryService({ enabled: false, serviceName: "test", serviceVersion: "1.0.0" }, logger);
    
    context = {
      message: { text: 'Check out this link: https://example.com' },
      providerName: 'test-provider',
      providerConfig: { name: 'test', type: 'test', accounts: [], config: {} },
      accountNames: ['test-account'],
      visibility: 'public',
      data: {},
      logger,
      telemetry,
      startTime: Date.now(),
      skip: false
    };
  });

  describe('basic URL tracking', () => {
    it('should add default UTM parameters and wrap URLs in HTML anchor tags', async () => {
      const middleware = new UrlTrackingMiddleware('test', {});

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Check out this link: <a href="https://example.com/?utm_medium=social&utm_source=mastodon">https://example.com</a>');
      expect(nextCalled).toHaveBeenCalled();
      expect(context.data['test_transformed']).toBe(true);
      expect(context.data['test_urls_processed']).toBe(1);
    });

    it('should not wrap URLs in HTML when wrap_in_html is false', async () => {
      const middleware = new UrlTrackingMiddleware('test', {
        wrap_in_html: false
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Check out this link: https://example.com/?utm_medium=social&utm_source=mastodon');
      expect(nextCalled).toHaveBeenCalled();
      expect(context.data['test_transformed']).toBe(true);
      expect(context.data['test_urls_processed']).toBe(1);
    });

    it('should add custom UTM parameters and wrap in HTML', async () => {
      const middleware = new UrlTrackingMiddleware('test', {
        utm_medium: 'custom_social',
        utm_source: 'bluesky',
        utm_campaign: 'summer2024',
        utm_term: 'promo',
        utm_content: 'header_link'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      const expectedHref = 'https://example.com/?utm_medium=custom_social&utm_source=bluesky&utm_campaign=summer2024&utm_term=promo&utm_content=header_link';
      const expectedResult = `<a href="${expectedHref}">https://example.com</a>`;
      expect(context.message.text).toBe(`Check out this link: ${expectedResult}`);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should handle multiple URLs in a message with HTML wrapping', async () => {
      context.message.text = 'Visit https://example.com and also https://test.com for more info';
      
      const middleware = new UrlTrackingMiddleware('test', {});

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toContain('<a href="https://example.com/?utm_medium=social&utm_source=mastodon">https://example.com</a>');
      expect(context.message.text).toContain('<a href="https://test.com/?utm_medium=social&utm_source=mastodon">https://test.com</a>');
      expect(context.data['test_urls_processed']).toBe(2);
    });

    it('should handle URLs with existing query parameters and wrap in HTML', async () => {
      context.message.text = 'Check this: https://example.com?existing=param&another=value';
      
      const middleware = new UrlTrackingMiddleware('test', {});

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      // The href should contain the normalized URL with UTM params, the display text should be the original URL
      expect(context.message.text).toContain('<a href="https://example.com/?existing=param&another=value&utm_medium=social&utm_source=mastodon">https://example.com?existing=param&another=value</a>');
    });

    it('should handle HTTP and HTTPS URLs with HTML wrapping', async () => {
      context.message.text = 'HTTP: http://example.com HTTPS: https://secure.com';
      
      const middleware = new UrlTrackingMiddleware('test', {});

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toContain('<a href="http://example.com/?utm_medium=social&utm_source=mastodon">http://example.com</a>');
      expect(context.message.text).toContain('<a href="https://secure.com/?utm_medium=social&utm_source=mastodon">https://secure.com</a>');
      expect(context.data['test_urls_processed']).toBe(2);
    });
  });

  describe('existing UTM parameters handling', () => {
    it('should skip URLs with existing UTM parameters when skip_existing_utm is true', async () => {
      context.message.text = 'Check: https://example.com/?utm_source=existing';
      
      const middleware = new UrlTrackingMiddleware('test', {
        skip_existing_utm: true
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Check: https://example.com/?utm_source=existing');
      expect(context.data['test_transformed']).toBeUndefined();
    });

    it('should add UTM parameters and wrap URLs with existing UTM when skip_existing_utm is false', async () => {
      context.message.text = 'Check: https://example.com/?utm_source=existing';
      
      const middleware = new UrlTrackingMiddleware('test', {
        skip_existing_utm: false
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toMatch(/<a href="https:\/\/example\.com\/\?[^"]*utm_medium=social[^"]*">https:\/\/example\.com\/\?utm_source=existing<\/a>/);
      expect(context.message.text).toContain('utm_source=existing'); // Original UTM should remain in display text
      expect(context.data['test_transformed']).toBe(true);
    });

    it('should override existing UTM parameters and wrap in HTML when override_existing is true', async () => {
      context.message.text = 'Check: https://example.com/?utm_source=existing&utm_medium=old';
      
      const middleware = new UrlTrackingMiddleware('test', {
        override_existing: true,
        utm_source: 'new_source',
        utm_medium: 'new_medium'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Check: <a href="https://example.com/?utm_source=new_source&utm_medium=new_medium">https://example.com/?utm_source=existing&utm_medium=old</a>');
    });
  });

  describe('domain filtering', () => {
    it('should only track URLs from included domains and wrap in HTML', async () => {
      context.message.text = 'Visit https://example.com and https://other.com';
      
      const middleware = new UrlTrackingMiddleware('test', {
        include_domains: ['example.com']
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toContain('<a href="https://example.com/?utm_medium=social&utm_source=mastodon">https://example.com</a>');
      expect(context.message.text).toContain('https://other.com'); // Should remain unchanged
      expect(context.data['test_urls_processed']).toBe(1);
    });

    it('should track all domains except excluded ones and wrap in HTML', async () => {
      context.message.text = 'Visit https://example.com and https://excluded.com';
      
      const middleware = new UrlTrackingMiddleware('test', {
        exclude_domains: ['excluded.com']
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toContain('<a href="https://example.com/?utm_medium=social&utm_source=mastodon">https://example.com</a>');
      expect(context.message.text).toContain('https://excluded.com'); // Should remain unchanged
      expect(context.data['test_urls_processed']).toBe(1);
    });

    it('should handle subdomain matching for included domains with HTML wrapping', async () => {
      context.message.text = 'Visit https://sub.example.com and https://example.com';
      
      const middleware = new UrlTrackingMiddleware('test', {
        include_domains: ['example.com']
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toContain('<a href="https://sub.example.com/?utm_medium=social&utm_source=mastodon">https://sub.example.com</a>');
      expect(context.message.text).toContain('<a href="https://example.com/?utm_medium=social&utm_source=mastodon">https://example.com</a>');
      expect(context.data['test_urls_processed']).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed URLs gracefully', async () => {
      context.message.text = 'Invalid URL: https:// and valid: https://example.com';
      
      const middleware = new UrlTrackingMiddleware('test', {});

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      // Should process the valid URL and leave invalid one unchanged
      expect(context.message.text).toContain('<a href="https://example.com/?utm_medium=social&utm_source=mastodon">https://example.com</a>');
      expect(context.message.text).toContain('https://'); // Invalid URL remains
    });

    it('should handle URLs with fragments and complex paths', async () => {
      context.message.text = 'Complex: https://example.com/path/to/page?param=value#section';
      
      const middleware = new UrlTrackingMiddleware('test', {});

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toMatch(/<a href="https:\/\/example\.com\/path\/to\/page\?[^"]*utm_medium=social[^"]*">https:\/\/example\.com\/path\/to\/page\?param=value#section<\/a>/);
      expect(context.message.text).toContain('utm_source=mastodon');
      expect(context.message.text).toContain('param=value');
      expect(context.message.text).toContain('#section');
    });

    it('should handle messages with no URLs', async () => {
      context.message.text = 'This message has no URLs at all!';
      
      const middleware = new UrlTrackingMiddleware('test', {});

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('This message has no URLs at all!');
      expect(context.data['test_transformed']).toBeUndefined();
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should handle empty or undefined UTM values without HTML wrapping when no tracking added', async () => {
      const middleware = new UrlTrackingMiddleware('test', {
        utm_medium: '',
        utm_source: undefined,
        utm_campaign: 'valid_campaign'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Check out this link: <a href="https://example.com/?utm_campaign=valid_campaign">https://example.com</a>');
    });
  });

  describe('HTML anchor tag wrapping', () => {
    it('should wrap URLs in HTML anchor tags by default', async () => {
      const middleware = new UrlTrackingMiddleware('test', {});

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Check out this link: <a href="https://example.com/?utm_medium=social&utm_source=mastodon">https://example.com</a>');
    });

    it('should not wrap URLs when wrap_in_html is explicitly set to false', async () => {
      const middleware = new UrlTrackingMiddleware('test', {
        wrap_in_html: false
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Check out this link: https://example.com/?utm_medium=social&utm_source=mastodon');
    });

    it('should not wrap URLs that are not tracked (filtered domains)', async () => {
      context.message.text = 'Check out: https://filtered.com';
      
      const middleware = new UrlTrackingMiddleware('test', {
        include_domains: ['example.com']
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Check out: https://filtered.com');
      expect(context.data['test_transformed']).toBeUndefined();
    });

    it('should not wrap URLs when no UTM parameters are added due to empty config', async () => {
      const middleware = new UrlTrackingMiddleware('test', {
        utm_medium: '',
        utm_source: '',
        utm_campaign: '',
        utm_term: '',
        utm_content: ''
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Check out this link: https://example.com');
      expect(context.data['test_transformed']).toBeUndefined();
    });

    it('should properly handle URL escaping in HTML attributes', async () => {
      context.message.text = 'Visit: https://example.com/path?param=value&other=123#fragment';
      
      const middleware = new UrlTrackingMiddleware('test', {});

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      // Check that the href attribute is properly formed and original URL is preserved in text
      expect(context.message.text).toMatch(/^Visit: <a href="https:\/\/example\.com\/path\?[^"]*">https:\/\/example\.com\/path\?param=value&other=123#fragment<\/a>$/);
      expect(context.message.text).toContain('utm_medium=social');
      expect(context.message.text).toContain('utm_source=mastodon');
    });
  });

  describe('disabled middleware', () => {
    it('should not be processed when disabled', async () => {
      const middleware = new UrlTrackingMiddleware('test', {}, false);

      expect(middleware.enabled).toBe(false);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      // Ensure no mocks from other tests interfere
      jest.restoreAllMocks();
    });

    it('should continue execution if URL processing fails', async () => {
      // Test with URLs that will trigger actual URL constructor errors, not just invalid strings
      context.message.text = 'Check: https://example.com and this invalid one: https://';
      
      const middleware = new UrlTrackingMiddleware('test', {});
      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // Should not throw error even if some URLs can't be processed
      await middleware.execute(context, nextCalled);
      expect(nextCalled).toHaveBeenCalled();
      
      // Valid URL should still be processed with HTML wrapping, invalid URL left as-is
      expect(context.message.text).toContain('<a href="https://example.com/?utm_medium=social&utm_source=mastodon">https://example.com</a>');
      expect(context.message.text).toContain('https://'); // Invalid URL remains unchanged
    });
  });

  describe('telemetry', () => {
    afterEach(() => {
      // Clean up any mocks after each test
      jest.restoreAllMocks();
    });

    it('should record telemetry when URLs are processed', async () => {
      const telemetrySpy = jest.spyOn(telemetry, 'incrementCounter');
      
      const middleware = new UrlTrackingMiddleware('test', {});
      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(telemetrySpy).toHaveBeenCalledWith(
        'url_tracking_middleware_processed',
        1,
        {
          middleware_name: 'test',
          provider_name: 'test-provider'
        }
      );
    });

    it('should record error telemetry when middleware fails', async () => {
      const telemetrySpy = jest.spyOn(telemetry, 'recordError');
      
      const middleware = new UrlTrackingMiddleware('test', {});
      await middleware.initialize(logger, telemetry);

      // Force an error in the execute method
      jest.spyOn(String.prototype, 'replace').mockImplementationOnce(() => {
        throw new Error('Test error');
      });

      const nextCalled = jest.fn();
      
      await expect(middleware.execute(context, nextCalled)).rejects.toThrow('Test error');
      expect(telemetrySpy).toHaveBeenCalledWith('url_tracking_middleware_error', 'test-provider');
    });
  });

  describe('URL regex edge cases', () => {
    it('should handle URLs with hyphens and special characters correctly', async () => {
      const middleware = new UrlTrackingMiddleware('test', {
        utm_medium: 'social',
        utm_source: 'mastodon', 
        utm_campaign: 'schachnachrichten'
      });

      await middleware.initialize(logger, telemetry);

      // Test the specific problematic URL from the bug report
      context.message.text = 'Read this: https://schachkicker.de/dijana-dengler-zitat-des-tages-der-woche-des-monats-oder-des-jahres/ and more.';

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      // Should capture the entire URL including hyphens and slashes
      expect(context.message.text).toBe(
        'Read this: <a href="https://schachkicker.de/dijana-dengler-zitat-des-tages-der-woche-des-monats-oder-des-jahres/?utm_medium=social&utm_source=mastodon&utm_campaign=schachnachrichten">https://schachkicker.de/dijana-dengler-zitat-des-tages-der-woche-des-monats-oder-des-jahres/</a> and more.'
      );
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should handle URLs with query parameters and fragments', async () => {
      const middleware = new UrlTrackingMiddleware('test', {
        utm_medium: 'social',
        utm_source: 'mastodon'
      });

      await middleware.initialize(logger, telemetry);

      context.message.text = 'Check: https://example.com/path-with-hyphens/page?query=value&other=test#section-name';

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toContain('path-with-hyphens');
      expect(context.message.text).toContain('query=value&other=test');
      expect(context.message.text).toContain('#section-name');
      expect(context.message.text).toContain('utm_medium=social');
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should handle URLs with parentheses and other special characters', async () => {
      const middleware = new UrlTrackingMiddleware('test', {
        utm_medium: 'social'
      });

      await middleware.initialize(logger, telemetry);

      context.message.text = 'Wikipedia: https://en.wikipedia.org/wiki/Chess_(disambiguation) is great.';

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toContain('Chess_(disambiguation)');
      expect(context.message.text).toContain('utm_medium=social');
      expect(nextCalled).toHaveBeenCalled();
    });
  });
});
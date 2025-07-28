#!/usr/bin/env python3
"""
Content length optimizer for social media platforms.
Intelligently truncates content while preserving meaning.
"""

import sys
import argparse
import re
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def optimize_length(content, max_length, preserve_hashtags=True, preserve_urls=True):
    """Optimize content length while preserving important elements."""
    
    if len(content) <= max_length:
        return content
    
    # Extract and preserve hashtags and URLs if requested
    hashtags = []
    urls = []
    
    if preserve_hashtags:
        hashtags = re.findall(r'#\w+', content)
        content = re.sub(r'#\w+', '', content)
    
    if preserve_urls:
        urls = re.findall(r'https?://\S+', content)
        content = re.sub(r'https?://\S+', '[URL]', content)
    
    # Clean up extra whitespace
    content = re.sub(r'\s+', ' ', content).strip()
    
    # Calculate space needed for preserved elements
    preserved_length = 0
    if hashtags:
        preserved_length += sum(len(tag) for tag in hashtags) + len(hashtags)  # +1 space per tag
    if urls:
        preserved_length += sum(len(url) for url in urls) + len(urls)  # +1 space per URL
    
    # Available space for main content
    available_length = max_length - preserved_length - 3  # -3 for "..."
    
    if available_length <= 0:
        # If preserved elements are too long, just truncate everything
        return content[:max_length-3] + "..."
    
    # Try to truncate at sentence boundaries
    optimized = truncate_at_sentence(content, available_length)
    
    # If that fails, try paragraph boundaries
    if not optimized:
        optimized = truncate_at_paragraph(content, available_length)
    
    # If that fails, try word boundaries
    if not optimized:
        optimized = truncate_at_word(content, available_length)
    
    # Last resort: character truncation
    if not optimized:
        optimized = content[:available_length] + "..."
    
    # Add back preserved elements
    if urls:
        # Replace [URL] placeholders with actual URLs
        for url in urls:
            optimized = optimized.replace('[URL]', url, 1)
    
    if hashtags:
        optimized += ' ' + ' '.join(hashtags)
    
    return optimized.strip()

def truncate_at_sentence(content, max_length):
    """Truncate at sentence boundaries."""
    sentences = re.split(r'[.!?]+\s+', content)
    optimized = ""
    
    for sentence in sentences:
        test_length = len(optimized + sentence + '. ')
        if test_length <= max_length:
            optimized += sentence + '. '
        else:
            break
    
    if optimized and len(optimized.strip()) > 10:  # Minimum meaningful length
        return optimized.strip() + "..."
    return None

def truncate_at_paragraph(content, max_length):
    """Truncate at paragraph boundaries."""
    paragraphs = content.split('\n\n')
    optimized = ""
    
    for paragraph in paragraphs:
        test_length = len(optimized + paragraph + '\n\n')
        if test_length <= max_length:
            optimized += paragraph + '\n\n'
        else:
            break
    
    if optimized and len(optimized.strip()) > 10:
        return optimized.strip() + "..."
    return None

def truncate_at_word(content, max_length):
    """Truncate at word boundaries."""
    words = content.split()
    optimized = ""
    
    for word in words:
        test_length = len(optimized + word + ' ')
        if test_length <= max_length:
            optimized += word + ' '
        else:
            break
    
    if optimized and len(optimized.strip()) > 10:
        return optimized.strip() + "..."
    return None

def get_platform_limits():
    """Get character limits for different platforms."""
    return {
        'mastodon': 500,
        'twitter': 280,
        'bluesky': 300,
        'linkedin': 3000,
        'facebook': 63206,
        'instagram': 2200
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Optimize content length for social media')
    parser.add_argument('--max-length', type=int, default=400, help='Maximum character length')
    parser.add_argument('--platform', choices=get_platform_limits().keys(), help='Target platform (sets max-length)')
    parser.add_argument('--preserve-hashtags', action='store_true', default=True, help='Preserve hashtags')
    parser.add_argument('--preserve-urls', action='store_true', default=True, help='Preserve URLs')
    parser.add_argument('--no-preserve-hashtags', action='store_false', dest='preserve_hashtags', help='Don\'t preserve hashtags')
    parser.add_argument('--no-preserve-urls', action='store_false', dest='preserve_urls', help='Don\'t preserve URLs')
    
    args = parser.parse_args()
    
    # Set max length based on platform if specified
    if args.platform:
        args.max_length = get_platform_limits()[args.platform]
    
    try:
        content = sys.stdin.read().strip()
        if not content:
            logger.error("No input content provided")
            sys.exit(1)
        
        result = optimize_length(
            content, 
            args.max_length,
            args.preserve_hashtags,
            args.preserve_urls
        )
        
        print(result)
        logger.info(f"Optimized from {len(content)} to {len(result)} characters")
        
    except Exception as e:
        logger.error(f"Script execution failed: {e}")
        sys.exit(1)
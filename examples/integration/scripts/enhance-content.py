#!/usr/bin/env python3
"""
Content enhancer that adds emojis, optimizes hashtags, and improves readability.
"""

import sys
import argparse
import re
import logging
from typing import List, Dict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Emoji mappings for common words/concepts
EMOJI_MAPPINGS = {
    # Technology
    'api': '🔌',
    'bug': '🐛',
    'fix': '🔧',
    'feature': '✨',
    'release': '🚀',
    'update': '📦',
    'security': '🔒',
    'performance': '⚡',
    'database': '🗄️',
    'server': '🖥️',
    'cloud': '☁️',
    'docker': '🐳',
    'kubernetes': '☸️',
    'git': '📝',
    
    # Business
    'sale': '💰',
    'discount': '🏷️',
    'new': '🆕',
    'launch': '🚀',
    'announcement': '📢',
    'success': '✅',
    'growth': '📈',
    'team': '👥',
    'meeting': '🤝',
    'deadline': '⏰',
    
    # Content
    'blog': '📝',
    'article': '📰',
    'video': '🎥',
    'podcast': '🎧',
    'tutorial': '📚',
    'guide': '📖',
    'tips': '💡',
    'news': '📰',
    'update': '📢',
    
    # Emotions/Actions
    'love': '❤️',
    'like': '👍',
    'thanks': '🙏',
    'welcome': '👋',
    'celebrate': '🎉',
    'congratulations': '🎊',
    'warning': '⚠️',
    'error': '❌',
    'success': '✅',
    'question': '❓',
}

# Hashtag suggestions based on content
HASHTAG_SUGGESTIONS = {
    'development': ['#dev', '#coding', '#programming', '#software'],
    'web': ['#webdev', '#frontend', '#backend', '#fullstack'],
    'mobile': ['#mobiledev', '#ios', '#android', '#app'],
    'data': ['#data', '#analytics', '#datascience', '#bigdata'],
    'ai': ['#ai', '#machinelearning', '#ml', '#artificialintelligence'],
    'business': ['#business', '#startup', '#entrepreneur', '#growth'],
    'marketing': ['#marketing', '#socialmedia', '#content', '#branding'],
    'design': ['#design', '#ui', '#ux', '#userexperience'],
    'security': ['#cybersecurity', '#infosec', '#security', '#privacy'],
    'cloud': ['#cloud', '#aws', '#azure', '#gcp', '#cloudcomputing'],
}

def enhance_content(content: str, add_emojis: bool = True, optimize_hashtags: bool = True, 
                   improve_readability: bool = True, max_hashtags: int = 5) -> str:
    """Enhance content with emojis, hashtags, and readability improvements."""
    
    enhanced = content
    
    if improve_readability:
        enhanced = improve_text_readability(enhanced)
    
    if add_emojis:
        enhanced = add_contextual_emojis(enhanced)
    
    if optimize_hashtags:
        enhanced = optimize_hashtags_in_content(enhanced, max_hashtags)
    
    return enhanced

def improve_text_readability(content: str) -> str:
    """Improve text readability with better formatting."""
    
    # Fix common spacing issues
    content = re.sub(r'\s+', ' ', content)  # Multiple spaces to single
    content = re.sub(r'\n\s*\n\s*\n+', '\n\n', content)  # Multiple newlines to double
    
    # Add proper spacing around punctuation
    content = re.sub(r'([.!?])([A-Z])', r'\1 \2', content)
    
    # Improve list formatting
    content = re.sub(r'^[-*]\s*', '• ', content, flags=re.MULTILINE)
    
    # Capitalize sentences properly
    sentences = re.split(r'([.!?]\s+)', content)
    for i in range(0, len(sentences), 2):
        if sentences[i]:
            sentences[i] = sentences[i][0].upper() + sentences[i][1:] if len(sentences[i]) > 1 else sentences[i].upper()
    content = ''.join(sentences)
    
    return content.strip()

def add_contextual_emojis(content: str) -> str:
    """Add emojis based on content context."""
    
    words = content.lower().split()
    content_lower = content.lower()
    
    # Track which emojis we've already added to avoid duplicates
    added_emojis = set()
    
    for word, emoji in EMOJI_MAPPINGS.items():
        if word in content_lower and emoji not in added_emojis:
            # Replace the first occurrence of the word with word + emoji
            pattern = r'\b' + re.escape(word) + r'\b'
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                original_word = match.group()
                content = content.replace(original_word, f"{original_word} {emoji}", 1)
                added_emojis.add(emoji)
    
    return content

def optimize_hashtags_in_content(content: str, max_hashtags: int) -> str:
    """Optimize hashtags based on content analysis."""
    
    # Extract existing hashtags
    existing_hashtags = set(re.findall(r'#\w+', content, re.IGNORECASE))
    
    # Analyze content for hashtag suggestions
    content_lower = content.lower()
    suggested_hashtags = []
    
    for category, hashtags in HASHTAG_SUGGESTIONS.items():
        if category in content_lower:
            for hashtag in hashtags:
                if hashtag.lower() not in [h.lower() for h in existing_hashtags]:
                    suggested_hashtags.append(hashtag)
    
    # Add technology-specific hashtags based on keywords
    tech_keywords = {
        'python': '#python',
        'javascript': '#javascript',
        'react': '#react',
        'vue': '#vuejs',
        'angular': '#angular',
        'node': '#nodejs',
        'docker': '#docker',
        'kubernetes': '#k8s',
        'aws': '#aws',
        'azure': '#azure',
        'gcp': '#gcp',
    }
    
    for keyword, hashtag in tech_keywords.items():
        if keyword in content_lower and hashtag not in existing_hashtags:
            suggested_hashtags.append(hashtag)
    
    # Limit the number of new hashtags
    new_hashtags_count = max_hashtags - len(existing_hashtags)
    if new_hashtags_count > 0:
        new_hashtags = suggested_hashtags[:new_hashtags_count]
        
        if new_hashtags:
            # Add hashtags at the end
            hashtag_section = ' '.join(new_hashtags)
            if content.strip().endswith('\n'):
                content = content.rstrip() + f"\n\n{hashtag_section}"
            else:
                content = content.rstrip() + f"\n\n{hashtag_section}"
    
    return content

def analyze_content_sentiment(content: str) -> str:
    """Analyze content sentiment and suggest appropriate emojis."""
    
    positive_words = ['great', 'awesome', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'excited']
    negative_words = ['bad', 'terrible', 'awful', 'hate', 'disappointed', 'frustrated', 'angry']
    neutral_words = ['update', 'change', 'new', 'announcement', 'information']
    
    content_lower = content.lower()
    
    positive_count = sum(1 for word in positive_words if word in content_lower)
    negative_count = sum(1 for word in negative_words if word in content_lower)
    
    if positive_count > negative_count:
        return 'positive'
    elif negative_count > positive_count:
        return 'negative'
    else:
        return 'neutral'

def add_call_to_action(content: str, cta_type: str = 'engagement') -> str:
    """Add appropriate call-to-action based on content type."""
    
    ctas = {
        'engagement': [
            "What do you think? 💭",
            "Share your thoughts! 💬",
            "Let me know in the comments! 👇",
        ],
        'sharing': [
            "Please share if you found this helpful! 🔄",
            "Tag someone who needs to see this! 👥",
            "Spread the word! 📢",
        ],
        'learning': [
            "Want to learn more? 📚",
            "Check out the full tutorial! 🔗",
            "Follow for more tips! ➡️",
        ]
    }
    
    if cta_type in ctas:
        import random
        cta = random.choice(ctas[cta_type])
        content = content.rstrip() + f"\n\n{cta}"
    
    return content

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Enhance content with emojis and hashtags')
    parser.add_argument('--add-emojis', action='store_true', default=True, help='Add contextual emojis')
    parser.add_argument('--optimize-hashtags', action='store_true', default=True, help='Optimize hashtags')
    parser.add_argument('--improve-readability', action='store_true', default=True, help='Improve text readability')
    parser.add_argument('--max-hashtags', type=int, default=5, help='Maximum number of hashtags')
    parser.add_argument('--add-cta', choices=['engagement', 'sharing', 'learning'], help='Add call-to-action')
    parser.add_argument('--no-emojis', action='store_false', dest='add_emojis', help='Don\'t add emojis')
    parser.add_argument('--no-hashtags', action='store_false', dest='optimize_hashtags', help='Don\'t optimize hashtags')
    
    args = parser.parse_args()
    
    try:
        content = sys.stdin.read().strip()
        if not content:
            logger.error("No input content provided")
            sys.exit(1)
        
        # Enhance the content
        result = enhance_content(
            content,
            add_emojis=args.add_emojis,
            optimize_hashtags=args.optimize_hashtags,
            improve_readability=args.improve_readability,
            max_hashtags=args.max_hashtags
        )
        
        # Add call-to-action if requested
        if args.add_cta:
            result = add_call_to_action(result, args.add_cta)
        
        print(result)
        logger.info(f"Enhanced content from {len(content)} to {len(result)} characters")
        
    except Exception as e:
        logger.error(f"Script execution failed: {e}")
        sys.exit(1)
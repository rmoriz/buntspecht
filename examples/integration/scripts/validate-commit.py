#!/usr/bin/env python3
"""
Git commit message validator for development updates.
Ensures commit messages follow conventional commit format.
"""

import sys
import re
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Conventional commit types
VALID_TYPES = {
    'feat': 'A new feature',
    'fix': 'A bug fix',
    'docs': 'Documentation only changes',
    'style': 'Changes that do not affect the meaning of the code',
    'refactor': 'A code change that neither fixes a bug nor adds a feature',
    'perf': 'A code change that improves performance',
    'test': 'Adding missing tests or correcting existing tests',
    'chore': 'Changes to the build process or auxiliary tools',
    'ci': 'Changes to CI configuration files and scripts',
    'build': 'Changes that affect the build system or external dependencies',
    'revert': 'Reverts a previous commit'
}

def validate_commit_message(message: str) -> tuple[bool, str]:
    """Validate commit message against conventional commit format."""
    
    lines = message.strip().split('\n')
    if not lines:
        return False, "Empty commit message"
    
    header = lines[0].strip()
    
    # Check conventional commit format: type(scope): description
    pattern = r'^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\(.+\))?: .{1,50}'
    
    if not re.match(pattern, header):
        return False, "Header doesn't match conventional commit format"
    
    # Extract type
    type_match = re.match(r'^(\w+)', header)
    if not type_match:
        return False, "Could not extract commit type"
    
    commit_type = type_match.group(1)
    if commit_type not in VALID_TYPES:
        return False, f"Invalid commit type '{commit_type}'. Valid types: {', '.join(VALID_TYPES.keys())}"
    
    # Check header length
    if len(header) > 72:
        return False, f"Header too long ({len(header)} chars). Maximum 72 characters."
    
    # Check for description
    description_match = re.search(r': (.+)$', header)
    if not description_match:
        return False, "Missing description after colon"
    
    description = description_match.group(1)
    if len(description) < 3:
        return False, "Description too short. Minimum 3 characters."
    
    # Check description doesn't end with period
    if description.endswith('.'):
        return False, "Description should not end with a period"
    
    # Check description starts with lowercase (unless it's a proper noun)
    if description[0].isupper() and not is_proper_noun(description.split()[0]):
        return False, "Description should start with lowercase letter"
    
    # Validate body if present
    if len(lines) > 1:
        # Check for blank line after header
        if len(lines) > 1 and lines[1].strip() != '':
            return False, "Missing blank line after header"
        
        # Check body line lengths
        for i, line in enumerate(lines[2:], start=3):
            if len(line) > 72:
                return False, f"Body line {i} too long ({len(line)} chars). Maximum 72 characters."
    
    return True, "Valid commit message"

def is_proper_noun(word: str) -> bool:
    """Check if word is likely a proper noun."""
    proper_nouns = {
        'API', 'HTTP', 'HTTPS', 'URL', 'JSON', 'XML', 'SQL', 'CSS', 'HTML',
        'JavaScript', 'TypeScript', 'Python', 'Java', 'React', 'Vue', 'Angular',
        'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'GitHub', 'GitLab',
        'README', 'LICENSE', 'TODO', 'FIXME', 'CHANGELOG'
    }
    return word in proper_nouns

def extract_commit_info(message: str) -> dict:
    """Extract structured information from commit message."""
    
    lines = message.strip().split('\n')
    header = lines[0].strip()
    
    # Extract type and scope
    type_scope_match = re.match(r'^(\w+)(\(([^)]+)\))?: (.+)$', header)
    if not type_scope_match:
        return {}
    
    commit_type = type_scope_match.group(1)
    scope = type_scope_match.group(3) if type_scope_match.group(3) else None
    description = type_scope_match.group(4)
    
    # Extract body and footer
    body = []
    footer = []
    
    if len(lines) > 2:
        in_footer = False
        for line in lines[2:]:
            if re.match(r'^[A-Z][a-z-]+:', line):  # Footer pattern
                in_footer = True
            
            if in_footer:
                footer.append(line)
            else:
                body.append(line)
    
    return {
        'type': commit_type,
        'scope': scope,
        'description': description,
        'body': '\n'.join(body).strip() if body else None,
        'footer': '\n'.join(footer).strip() if footer else None,
        'breaking': 'BREAKING CHANGE' in message or '!' in header
    }

def should_post_commit(commit_info: dict) -> tuple[bool, str]:
    """Determine if commit should be posted to social media."""
    
    commit_type = commit_info.get('type', '')
    description = commit_info.get('description', '')
    
    # Always post breaking changes
    if commit_info.get('breaking'):
        return True, "Breaking change detected"
    
    # Post significant features
    if commit_type == 'feat':
        return True, "New feature"
    
    # Post important fixes
    if commit_type == 'fix':
        # Skip minor fixes
        minor_keywords = ['typo', 'formatting', 'whitespace', 'comment']
        if any(keyword in description.lower() for keyword in minor_keywords):
            return False, "Minor fix, not significant for social media"
        return True, "Bug fix"
    
    # Post performance improvements
    if commit_type == 'perf':
        return True, "Performance improvement"
    
    # Skip documentation, style, and chore commits
    if commit_type in ['docs', 'style', 'chore', 'ci', 'build']:
        return False, f"'{commit_type}' commits not posted to social media"
    
    # Post refactoring if significant
    if commit_type == 'refactor':
        significant_keywords = ['architecture', 'restructure', 'redesign', 'major']
        if any(keyword in description.lower() for keyword in significant_keywords):
            return True, "Significant refactoring"
        return False, "Minor refactoring, not significant for social media"
    
    return True, "Default: post commit"

if __name__ == "__main__":
    try:
        content = sys.stdin.read().strip()
        if not content:
            logger.error("No commit message provided")
            sys.exit(1)
        
        # Validate commit message format
        is_valid, validation_message = validate_commit_message(content)
        
        if not is_valid:
            logger.error(f"Invalid commit message: {validation_message}")
            sys.exit(1)
        
        # Extract commit information
        commit_info = extract_commit_info(content)
        
        # Check if commit should be posted
        should_post, reason = should_post_commit(commit_info)
        
        if should_post:
            logger.info(f"Commit validation passed: {reason}")
            sys.exit(0)  # Success - continue processing
        else:
            logger.info(f"Commit validation passed but skipping post: {reason}")
            sys.exit(1)  # Skip posting
            
    except Exception as e:
        logger.error(f"Script execution failed: {e}")
        sys.exit(1)
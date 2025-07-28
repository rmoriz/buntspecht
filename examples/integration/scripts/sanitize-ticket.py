#!/usr/bin/env python3
"""
Support ticket sanitizer for social media posting.
Removes sensitive information and formats for public consumption.
"""

import sys
import json
import re
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def sanitize_ticket(content):
    """Sanitize support ticket data for social media posting."""
    try:
        # Try to parse as JSON first
        try:
            data = json.loads(content)
            return sanitize_json_ticket(data)
        except json.JSONDecodeError:
            # If not JSON, treat as plain text
            return sanitize_text_ticket(content)
            
    except Exception as e:
        logger.error(f"Error sanitizing ticket: {e}")
        return f"Error processing support ticket: {str(e)}"

def sanitize_json_ticket(data):
    """Sanitize JSON ticket data."""
    # Extract safe fields
    ticket_id = data.get('id', 'Unknown')
    priority = data.get('priority', 'normal')
    subject = data.get('subject', 'No subject')
    status = data.get('status', 'open')
    category = data.get('category', 'general')
    
    # Remove sensitive information from subject
    subject = remove_sensitive_info(subject)
    
    # Format priority emoji
    priority_emoji = {
        'low': '🟢',
        'normal': '🟡', 
        'high': '🟠',
        'critical': '🔴'
    }.get(priority.lower(), '⚪')
    
    # Format status emoji
    status_emoji = {
        'open': '📂',
        'in_progress': '⚙️',
        'resolved': '✅',
        'closed': '📁'
    }.get(status.lower(), '📄')
    
    # Build sanitized message
    message = f"{priority_emoji} Support Ticket #{ticket_id}\n"
    message += f"📋 {subject}\n"
    message += f"🏷️ Category: {category.title()}\n"
    message += f"{status_emoji} Status: {status.title()}"
    
    return message

def sanitize_text_ticket(content):
    """Sanitize plain text ticket content."""
    # Remove common sensitive patterns
    content = remove_sensitive_info(content)
    
    # Extract ticket ID if present
    ticket_match = re.search(r'#?(\d{4,})', content)
    ticket_id = ticket_match.group(1) if ticket_match else 'Unknown'
    
    # Truncate if too long
    if len(content) > 200:
        content = content[:197] + "..."
    
    return f"🎫 Support Ticket #{ticket_id}\n\n{content}"

def remove_sensitive_info(text):
    """Remove sensitive information from text."""
    # Remove email addresses
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]', text)
    
    # Remove phone numbers
    text = re.sub(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[PHONE]', text)
    
    # Remove IP addresses
    text = re.sub(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', '[IP]', text)
    
    # Remove credit card patterns
    text = re.sub(r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b', '[CARD]', text)
    
    # Remove social security numbers
    text = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[SSN]', text)
    
    # Remove URLs (keep domain for context)
    text = re.sub(r'https?://([^/\s]+)[^\s]*', r'[URL: \1]', text)
    
    return text

if __name__ == "__main__":
    try:
        content = sys.stdin.read().strip()
        if not content:
            logger.error("No input content provided")
            sys.exit(1)
            
        result = sanitize_ticket(content)
        print(result)
        
    except Exception as e:
        logger.error(f"Script execution failed: {e}")
        sys.exit(1)
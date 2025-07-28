#!/usr/bin/env python3
"""
Alert deduplication script for monitoring systems.
Prevents spam by detecting and suppressing duplicate alerts.
"""

import sys
import json
import hashlib
import os
import time
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
CACHE_DIR = os.environ.get('ALERT_CACHE_DIR', '/tmp/buntspecht-alerts')
CACHE_DURATION = int(os.environ.get('ALERT_CACHE_DURATION', '3600'))  # 1 hour default
SIMILARITY_THRESHOLD = float(os.environ.get('ALERT_SIMILARITY_THRESHOLD', '0.8'))

def setup_cache_dir():
    """Ensure cache directory exists."""
    Path(CACHE_DIR).mkdir(parents=True, exist_ok=True)

def generate_alert_hash(alert_data: Dict[str, Any]) -> str:
    """Generate a hash for alert deduplication."""
    
    # Extract key fields for hashing
    key_fields = {
        'service': alert_data.get('service', ''),
        'severity': alert_data.get('severity', ''),
        'message': normalize_message(alert_data.get('message', '')),
        'alert_type': alert_data.get('type', ''),
    }
    
    # Create a stable hash
    content = json.dumps(key_fields, sort_keys=True)
    return hashlib.sha256(content.encode()).hexdigest()

def normalize_message(message: str) -> str:
    """Normalize alert message for better deduplication."""
    
    # Remove timestamps
    import re
    message = re.sub(r'\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}', '[TIMESTAMP]', message)
    message = re.sub(r'\d{2}:\d{2}:\d{2}', '[TIME]', message)
    
    # Remove specific numbers that might vary
    message = re.sub(r'\b\d+\.\d+%', '[PERCENTAGE]', message)
    message = re.sub(r'\b\d+\s*(MB|GB|KB|bytes?)', '[SIZE]', message)
    message = re.sub(r'\b\d+\s*ms', '[DURATION]', message)
    
    # Remove IP addresses and ports
    message = re.sub(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b', '[IP]', message)
    
    # Normalize whitespace
    message = re.sub(r'\s+', ' ', message).strip()
    
    return message.lower()

def is_duplicate_alert(alert_hash: str) -> bool:
    """Check if alert is a duplicate based on cache."""
    
    cache_file = Path(CACHE_DIR) / f"{alert_hash}.json"
    
    if not cache_file.exists():
        return False
    
    try:
        with open(cache_file, 'r') as f:
            cache_data = json.load(f)
        
        # Check if cache entry is still valid
        if time.time() - cache_data['timestamp'] > CACHE_DURATION:
            # Cache expired, remove it
            cache_file.unlink()
            return False
        
        # Update last seen time
        cache_data['last_seen'] = time.time()
        cache_data['count'] += 1
        
        with open(cache_file, 'w') as f:
            json.dump(cache_data, f)
        
        logger.info(f"Duplicate alert detected (seen {cache_data['count']} times)")
        return True
        
    except Exception as e:
        logger.error(f"Error reading cache file {cache_file}: {e}")
        return False

def cache_alert(alert_hash: str, alert_data: Dict[str, Any]):
    """Cache alert to prevent future duplicates."""
    
    cache_file = Path(CACHE_DIR) / f"{alert_hash}.json"
    
    cache_data = {
        'timestamp': time.time(),
        'last_seen': time.time(),
        'count': 1,
        'alert_data': alert_data
    }
    
    try:
        with open(cache_file, 'w') as f:
            json.dump(cache_data, f)
        logger.debug(f"Cached alert with hash {alert_hash}")
    except Exception as e:
        logger.error(f"Error writing cache file {cache_file}: {e}")

def cleanup_expired_cache():
    """Remove expired cache entries."""
    
    try:
        cache_dir = Path(CACHE_DIR)
        if not cache_dir.exists():
            return
        
        current_time = time.time()
        removed_count = 0
        
        for cache_file in cache_dir.glob("*.json"):
            try:
                with open(cache_file, 'r') as f:
                    cache_data = json.load(f)
                
                if current_time - cache_data['timestamp'] > CACHE_DURATION:
                    cache_file.unlink()
                    removed_count += 1
                    
            except Exception as e:
                logger.warning(f"Error processing cache file {cache_file}: {e}")
                # Remove corrupted cache files
                cache_file.unlink()
                removed_count += 1
        
        if removed_count > 0:
            logger.info(f"Cleaned up {removed_count} expired cache entries")
            
    except Exception as e:
        logger.error(f"Error during cache cleanup: {e}")

def parse_alert_content(content: str) -> Optional[Dict[str, Any]]:
    """Parse alert content from various formats."""
    
    try:
        # Try JSON first
        return json.loads(content)
    except json.JSONDecodeError:
        pass
    
    # Try to extract structured data from text
    alert_data = {}
    
    # Extract common patterns
    import re
    
    # Service name
    service_match = re.search(r'service[:\s]+([^\n\r]+)', content, re.IGNORECASE)
    if service_match:
        alert_data['service'] = service_match.group(1).strip()
    
    # Severity
    severity_match = re.search(r'severity[:\s]+(\w+)', content, re.IGNORECASE)
    if severity_match:
        alert_data['severity'] = severity_match.group(1).strip()
    elif re.search(r'\b(critical|high|medium|low)\b', content, re.IGNORECASE):
        severity_match = re.search(r'\b(critical|high|medium|low)\b', content, re.IGNORECASE)
        alert_data['severity'] = severity_match.group(1)
    
    # Message (use the whole content if no specific message found)
    alert_data['message'] = content
    
    # Alert type
    if 'cpu' in content.lower():
        alert_data['type'] = 'cpu'
    elif 'memory' in content.lower():
        alert_data['type'] = 'memory'
    elif 'disk' in content.lower():
        alert_data['type'] = 'disk'
    elif 'network' in content.lower():
        alert_data['type'] = 'network'
    else:
        alert_data['type'] = 'general'
    
    return alert_data

def should_suppress_alert(alert_data: Dict[str, Any]) -> tuple[bool, str]:
    """Determine if alert should be suppressed and why."""
    
    # Generate hash for this alert
    alert_hash = generate_alert_hash(alert_data)
    
    # Check for duplicates
    if is_duplicate_alert(alert_hash):
        return True, f"Duplicate alert (hash: {alert_hash[:8]})"
    
    # Cache this alert for future deduplication
    cache_alert(alert_hash, alert_data)
    
    # Additional suppression rules
    severity = alert_data.get('severity', '').lower()
    message = alert_data.get('message', '').lower()
    
    # Suppress low severity alerts during business hours
    if severity in ['low', 'info']:
        current_hour = time.localtime().tm_hour
        if 9 <= current_hour <= 17:  # Business hours
            return True, "Low severity alert during business hours"
    
    # Suppress test alerts
    if any(keyword in message for keyword in ['test', 'testing', 'demo']):
        return True, "Test alert detected"
    
    return False, ""

if __name__ == "__main__":
    try:
        # Setup
        setup_cache_dir()
        cleanup_expired_cache()
        
        # Read input
        content = sys.stdin.read().strip()
        if not content:
            logger.error("No input content provided")
            sys.exit(1)
        
        # Parse alert
        alert_data = parse_alert_content(content)
        if not alert_data:
            logger.error("Could not parse alert content")
            sys.exit(1)
        
        # Check if alert should be suppressed
        suppress, reason = should_suppress_alert(alert_data)
        
        if suppress:
            logger.info(f"Alert suppressed: {reason}")
            sys.exit(1)  # Exit with failure to skip the message
        else:
            logger.info("Alert allowed through deduplication filter")
            sys.exit(0)  # Exit with success to continue processing
            
    except Exception as e:
        logger.error(f"Script execution failed: {e}")
        sys.exit(1)
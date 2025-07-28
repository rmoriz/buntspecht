#!/bin/bash
# Simple profanity filter for content moderation
# This is a basic example - in production, use a more sophisticated solution

# Set up logging
LOG_LEVEL=${LOG_LEVEL:-"INFO"}
SCRIPT_NAME="profanity-filter"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$LOG_LEVEL] [$SCRIPT_NAME] $1" >&2
}

# Configuration
STRICT_MODE=${PROFANITY_STRICT_MODE:-"false"}
CUSTOM_WORDLIST=${PROFANITY_CUSTOM_WORDLIST:-""}

# Basic profanity word list (add more as needed)
PROFANITY_WORDS=(
    "spam"
    "scam" 
    "fake"
    "fraud"
    "phishing"
    "malware"
    "virus"
    # Add more words as needed
)

# Load custom wordlist if provided
if [[ -n "$CUSTOM_WORDLIST" && -f "$CUSTOM_WORDLIST" ]]; then
    log "Loading custom wordlist from $CUSTOM_WORDLIST"
    while IFS= read -r word; do
        PROFANITY_WORDS+=("$word")
    done < "$CUSTOM_WORDLIST"
fi

# Read input
INPUT=$(cat)

if [[ -z "$INPUT" ]]; then
    log "ERROR: No input content provided"
    exit 1
fi

# Convert to lowercase for case-insensitive matching
INPUT_LOWER=$(echo "$INPUT" | tr '[:upper:]' '[:lower:]')

# Check for profanity
FOUND_PROFANITY=false
FOUND_WORDS=()

for word in "${PROFANITY_WORDS[@]}"; do
    if echo "$INPUT_LOWER" | grep -q -w "$word"; then
        FOUND_PROFANITY=true
        FOUND_WORDS+=("$word")
        log "Found inappropriate content: $word"
    fi
done

# Additional checks for strict mode
if [[ "$STRICT_MODE" == "true" ]]; then
    # Check for excessive caps (more than 50% uppercase)
    CAPS_COUNT=$(echo "$INPUT" | grep -o '[A-Z]' | wc -l)
    TOTAL_LETTERS=$(echo "$INPUT" | grep -o '[A-Za-z]' | wc -l)
    
    if [[ $TOTAL_LETTERS -gt 0 ]]; then
        CAPS_PERCENTAGE=$((CAPS_COUNT * 100 / TOTAL_LETTERS))
        if [[ $CAPS_PERCENTAGE -gt 50 ]]; then
            log "Excessive caps detected: ${CAPS_PERCENTAGE}%"
            FOUND_PROFANITY=true
            FOUND_WORDS+=("excessive_caps")
        fi
    fi
    
    # Check for excessive punctuation
    PUNCT_COUNT=$(echo "$INPUT" | grep -o '[!?]' | wc -l)
    if [[ $PUNCT_COUNT -gt 5 ]]; then
        log "Excessive punctuation detected: $PUNCT_COUNT exclamation/question marks"
        FOUND_PROFANITY=true
        FOUND_WORDS+=("excessive_punctuation")
    fi
    
    # Check for suspicious patterns
    if echo "$INPUT_LOWER" | grep -q -E "(click here|buy now|limited time|act fast|urgent|winner|congratulations)"; then
        log "Suspicious marketing language detected"
        FOUND_PROFANITY=true
        FOUND_WORDS+=("suspicious_marketing")
    fi
fi

# Report results
if [[ "$FOUND_PROFANITY" == "true" ]]; then
    log "Content failed profanity filter. Found: ${FOUND_WORDS[*]}"
    exit 1
else
    log "Content passed profanity filter"
    exit 0
fi
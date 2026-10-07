




class setup_reason:
    def __init__(self):
        self.reasons = {}

    def set(self, key, reason: str):
        """Set a reason string for a specific key (e.g., 'BUY', 'SELL')"""
        self.reasons[key] = reason

    def get(self, key):
        """Get the reason string for a specific key, or None if not set"""
        return self.reasons.get(key)

    def has(self, key):
        """Check if a reason exists for a given key"""
        return key in self.reasons

    def all(self):
        """Return all reasons as a dictionary"""
        return self.reasons

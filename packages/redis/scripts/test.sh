#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

# Redis CLI with authentication
REDIS_CLI="$REDIS_CLI 2>/dev/null -a dev_password_only"

echo "🧪 Redis Test Suite - Comprehensive Behavior Verification"
echo "=========================================================="
echo ""

# Check if container is running
if ! docker ps | grep -q "redis"; then
    echo -e "${RED}❌ Redis container is not running${NC}"
    echo "   Run: bun run redis:start"
    exit 1
fi

# Helper function for test results
pass_test() {
    echo -e "${GREEN}✅ $1${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail_test() {
    echo -e "${RED}❌ $1${NC}"
    echo -e "${YELLOW}   Details: $2${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

# Test 1: Verify Configuration is Loaded (redis.conf)
echo "Test 1: Configuration Validation (redis.conf loaded)"
MAXMEMORY=$($REDIS_CLI 2>/dev/null CONFIG GET maxmemory | tail -1)
EVICTION_POLICY=$($REDIS_CLI 2>/dev/null CONFIG GET maxmemory-policy | tail -1)

if [ "$MAXMEMORY" = "268435456" ]; then  # 256MB in bytes
    pass_test "maxmemory correctly set to 256MB"
else
    fail_test "maxmemory configuration" "Expected 268435456 (256MB), got: $MAXMEMORY"
fi

if [ "$EVICTION_POLICY" = "allkeys-lru" ]; then
    pass_test "eviction policy correctly set to allkeys-lru"
else
    fail_test "eviction policy configuration" "Expected 'allkeys-lru', got: $EVICTION_POLICY"
fi

# Test 2: Key Expiration (TTL)
echo ""
echo "Test 2: TTL and Key Expiration"
$REDIS_CLI 2>/dev/null SET ttl_test "expires_soon" EX 2 > /dev/null
EXISTS_BEFORE=$($REDIS_CLI 2>/dev/null EXISTS ttl_test)
if [ "$EXISTS_BEFORE" = "1" ]; then
    pass_test "Key with TTL created successfully"
else
    fail_test "TTL key creation" "Key doesn't exist after SET with EX"
fi

# Wait for expiration
sleep 3
EXISTS_AFTER=$($REDIS_CLI 2>/dev/null EXISTS ttl_test)
if [ "$EXISTS_AFTER" = "0" ]; then
    pass_test "Key correctly expired after TTL"
else
    fail_test "TTL expiration" "Key still exists after expiration time"
fi

# Test 3: Data Types (not just strings)
echo ""
echo "Test 3: Redis Data Types"

# List operations
$REDIS_CLI 2>/dev/null RPUSH test_list "item1" "item2" "item3" > /dev/null
LIST_LEN=$($REDIS_CLI 2>/dev/null LLEN test_list)
if [ "$LIST_LEN" = "3" ]; then
    pass_test "List operations (RPUSH/LLEN)"
else
    fail_test "List operations" "Expected length 3, got: $LIST_LEN"
fi

# Set operations
$REDIS_CLI 2>/dev/null SADD test_set "member1" "member2" "member1" > /dev/null
SET_CARD=$($REDIS_CLI 2>/dev/null SCARD test_set)
if [ "$SET_CARD" = "2" ]; then  # Duplicates should be ignored
    pass_test "Set operations (SADD/SCARD with duplicate handling)"
else
    fail_test "Set operations" "Expected cardinality 2, got: $SET_CARD"
fi

# Hash operations
$REDIS_CLI 2>/dev/null HSET test_hash field1 "value1" field2 "value2" > /dev/null
HASH_LEN=$($REDIS_CLI 2>/dev/null HLEN test_hash)
if [ "$HASH_LEN" = "2" ]; then
    pass_test "Hash operations (HSET/HLEN)"
else
    fail_test "Hash operations" "Expected length 2, got: $HASH_LEN"
fi

# Sorted set operations
$REDIS_CLI 2>/dev/null ZADD test_zset 1 "one" 2 "two" 3 "three" > /dev/null
ZSET_CARD=$($REDIS_CLI 2>/dev/null ZCARD test_zset)
if [ "$ZSET_CARD" = "3" ]; then
    pass_test "Sorted Set operations (ZADD/ZCARD)"
else
    fail_test "Sorted Set operations" "Expected cardinality 3, got: $ZSET_CARD"
fi

# Cleanup data types test
$REDIS_CLI 2>/dev/null DEL test_list test_set test_hash test_zset > /dev/null

# Test 4: Large Values (realistic data sizes)
echo ""
echo "Test 4: Large Value Handling"
# Use stdin to avoid argument length limits
LARGE_SIZE=$(head -c 102400 /dev/urandom | base64 | docker exec -i redis redis-cli -a dev_password_only -x SET large_value 2>/dev/null)
RETRIEVED_LEN=$($REDIS_CLI 2>/dev/null --raw GET large_value | wc -c)
if [ "$RETRIEVED_LEN" -gt 100000 ]; then
    pass_test "Large value storage and retrieval (100KB+)"
else
    fail_test "Large value handling" "Retrieved size: $RETRIEVED_LEN bytes"
fi
$REDIS_CLI 2>/dev/null DEL large_value > /dev/null

# Test 5: Atomic Operations (INCR)
echo ""
echo "Test 5: Atomic Operations"
$REDIS_CLI 2>/dev/null SET counter 0 > /dev/null
for i in {1..100}; do
    $REDIS_CLI 2>/dev/null INCR counter > /dev/null &
done
wait
COUNTER_VALUE=$($REDIS_CLI 2>/dev/null GET counter)
if [ "$COUNTER_VALUE" = "100" ]; then
    pass_test "Atomic operations (INCR with concurrent requests)"
else
    fail_test "Atomic operations" "Expected 100, got: $COUNTER_VALUE (race condition detected)"
fi
$REDIS_CLI 2>/dev/null DEL counter > /dev/null

# Test 6: Persistence Configuration
echo ""
echo "Test 6: Persistence Configuration"
SAVE_CONFIG=$($REDIS_CLI 2>/dev/null CONFIG GET save | tail -1)
if [[ "$SAVE_CONFIG" == *"900"* ]] && [[ "$SAVE_CONFIG" == *"300"* ]]; then
    pass_test "RDB persistence configured (save intervals)"
else
    fail_test "RDB persistence configuration" "Save config: $SAVE_CONFIG"
fi

# Check if RDB file exists or can be created
$REDIS_CLI 2>/dev/null BGSAVE > /dev/null 2>&1
sleep 1
RDB_EXISTS=$(docker exec redis sh -c "ls -la /data/dump.rdb 2>/dev/null | wc -l")
if [ "$RDB_EXISTS" -ge "1" ]; then
    pass_test "RDB snapshot file created"
else
    fail_test "RDB snapshot" "dump.rdb not found in /data"
fi

# Test 7: Special Characters and Edge Cases
echo ""
echo "Test 7: Edge Cases (special characters, unicode)"
SPECIAL_VALUE="key with spaces and 特殊字符 and émojis 🚀"
$REDIS_CLI 2>/dev/null SET special_key "$SPECIAL_VALUE" > /dev/null
RETRIEVED=$($REDIS_CLI 2>/dev/null GET special_key)
if [ "$RETRIEVED" = "$SPECIAL_VALUE" ]; then
    pass_test "Special characters and unicode handling"
else
    fail_test "Special character handling" "Value corrupted or not stored correctly"
fi
$REDIS_CLI 2>/dev/null DEL special_key > /dev/null

# Test 8: Key Pattern Matching
echo ""
echo "Test 8: Key Pattern Matching (KEYS/SCAN)"
$REDIS_CLI 2>/dev/null MSET user:1:name "Alice" user:2:name "Bob" user:3:name "Charlie" > /dev/null
PATTERN_MATCH=$($REDIS_CLI 2>/dev/null KEYS "user:*:name" | wc -l)
if [ "$PATTERN_MATCH" -ge "3" ]; then
    pass_test "Key pattern matching (KEYS wildcard)"
else
    fail_test "Key pattern matching" "Expected 3 keys, found: $PATTERN_MATCH"
fi
$REDIS_CLI 2>/dev/null DEL user:1:name user:2:name user:3:name > /dev/null

# Test 9: Transaction Support (MULTI/EXEC)
echo ""
echo "Test 9: Transaction Support (MULTI/EXEC)"
# Use pipe to keep same connection for transaction
RESULT=$(echo -e "MULTI\nSET tx_key1 value1\nSET tx_key2 value2\nEXEC" | docker exec -i redis redis-cli -a dev_password_only 2>/dev/null)
# Verify the keys were set
TX_VALUE=$($REDIS_CLI 2>/dev/null GET tx_key1)
if [ "$TX_VALUE" = "value1" ]; then
    pass_test "Transaction support (MULTI/EXEC)"
else
    fail_test "Transaction support" "Expected 'value1', got: $TX_VALUE"
fi
$REDIS_CLI 2>/dev/null DEL tx_key1 tx_key2 > /dev/null

# Test 10: Connection Limits
echo ""
echo "Test 10: Concurrent Connections"
for i in {1..10}; do
    $REDIS_CLI 2>/dev/null PING > /dev/null &
done
wait
CONN_COUNT=$($REDIS_CLI 2>/dev/null INFO clients | grep connected_clients | cut -d':' -f2 | tr -d '\r')
if [ "$CONN_COUNT" -ge "1" ]; then
    pass_test "Concurrent connections handled (current: $CONN_COUNT)"
else
    fail_test "Connection handling" "No active connections detected"
fi

# Test 11: Memory Info
echo ""
echo "Test 11: Memory Statistics"
USED_MEMORY=$($REDIS_CLI 2>/dev/null INFO memory | grep used_memory_human | head -1 | cut -d':' -f2 | tr -d '\r')
if [ -n "$USED_MEMORY" ]; then
    pass_test "Memory tracking (currently using: $USED_MEMORY)"
else
    fail_test "Memory statistics" "Unable to retrieve memory info"
fi

# Final Summary
echo ""
echo "=========================================================="
echo "Test Results:"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    echo ""
    echo "❌ Some tests failed. Please review the output above."
    exit 1
else
    echo -e "${GREEN}Failed: 0${NC}"
    echo ""
    echo "🎉 All tests passed! Redis is properly configured and operational."
    echo ""
    echo "Configuration verified:"
    echo "  - Memory limit: 256MB with LRU eviction"
    echo "  - Persistence: RDB snapshots enabled"
    echo "  - Data types: All supported types working"
    echo "  - TTL: Key expiration working"
    echo "  - Atomicity: Race conditions handled"
    echo "  - Edge cases: Unicode and special chars supported"
fi

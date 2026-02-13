#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

REDIS_CLI="redis-cli"

echo "Redis Test Suite"
echo "=========================================================="
echo ""

# Strict: redis must be reachable
if ! $REDIS_CLI PING 2>/dev/null | grep -q PONG; then
    echo -e "${RED}FAIL: redis is not reachable${NC}" >&2
    exit 1
fi

pass_test() {
    echo -e "${GREEN}  pass${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail_test() {
    echo -e "${RED}  fail${NC} $1 — $2"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

# Test 1: Connectivity
echo "Test 1: Connectivity"
PONG=$($REDIS_CLI PING 2>/dev/null)
if [ "$PONG" = "PONG" ]; then
    pass_test "PING/PONG"
else
    fail_test "PING" "Expected PONG, got: $PONG"
fi

# Test 2: Key Expiration (TTL)
echo ""
echo "Test 2: TTL and Key Expiration"
$REDIS_CLI SET _test:ttl "expires_soon" EX 2 > /dev/null 2>&1
EXISTS_BEFORE=$($REDIS_CLI EXISTS _test:ttl 2>/dev/null)
if [ "$EXISTS_BEFORE" = "1" ]; then
    pass_test "Key with TTL created"
else
    fail_test "TTL key creation" "Key doesn't exist after SET with EX"
fi

sleep 3
EXISTS_AFTER=$($REDIS_CLI EXISTS _test:ttl 2>/dev/null)
if [ "$EXISTS_AFTER" = "0" ]; then
    pass_test "Key expired after TTL"
else
    fail_test "TTL expiration" "Key still exists"
fi

# Test 3: Data Types
echo ""
echo "Test 3: Data Types"

$REDIS_CLI RPUSH _test:list "a" "b" "c" > /dev/null 2>&1
LIST_LEN=$($REDIS_CLI LLEN _test:list 2>/dev/null)
if [ "$LIST_LEN" = "3" ]; then
    pass_test "List (RPUSH/LLEN)"
else
    fail_test "List" "Expected 3, got: $LIST_LEN"
fi

$REDIS_CLI SADD _test:set "x" "y" "x" > /dev/null 2>&1
SET_CARD=$($REDIS_CLI SCARD _test:set 2>/dev/null)
if [ "$SET_CARD" = "2" ]; then
    pass_test "Set (deduplication)"
else
    fail_test "Set" "Expected 2, got: $SET_CARD"
fi

$REDIS_CLI HSET _test:hash f1 "v1" f2 "v2" > /dev/null 2>&1
HASH_LEN=$($REDIS_CLI HLEN _test:hash 2>/dev/null)
if [ "$HASH_LEN" = "2" ]; then
    pass_test "Hash (HSET/HLEN)"
else
    fail_test "Hash" "Expected 2, got: $HASH_LEN"
fi

$REDIS_CLI ZADD _test:zset 1 "one" 2 "two" 3 "three" > /dev/null 2>&1
ZSET_CARD=$($REDIS_CLI ZCARD _test:zset 2>/dev/null)
if [ "$ZSET_CARD" = "3" ]; then
    pass_test "Sorted Set (ZADD/ZCARD)"
else
    fail_test "Sorted Set" "Expected 3, got: $ZSET_CARD"
fi

$REDIS_CLI DEL _test:list _test:set _test:hash _test:zset > /dev/null 2>&1

# Test 4: Atomic Operations (INCR)
echo ""
echo "Test 4: Atomic Operations"
$REDIS_CLI SET _test:counter 0 > /dev/null 2>&1
for i in {1..100}; do
    $REDIS_CLI INCR _test:counter > /dev/null 2>&1 &
done
wait
COUNTER_VALUE=$($REDIS_CLI GET _test:counter 2>/dev/null)
if [ "$COUNTER_VALUE" = "100" ]; then
    pass_test "Concurrent INCR (100 parallel)"
else
    fail_test "Atomic INCR" "Expected 100, got: $COUNTER_VALUE"
fi
$REDIS_CLI DEL _test:counter > /dev/null 2>&1

# Test 5: Transactions (MULTI/EXEC)
echo ""
echo "Test 5: Transactions"
echo -e "MULTI\nSET _test:tx1 value1\nSET _test:tx2 value2\nEXEC" | $REDIS_CLI > /dev/null 2>&1
TX_VALUE=$($REDIS_CLI GET _test:tx1 2>/dev/null)
if [ "$TX_VALUE" = "value1" ]; then
    pass_test "MULTI/EXEC"
else
    fail_test "Transaction" "Expected 'value1', got: $TX_VALUE"
fi
$REDIS_CLI DEL _test:tx1 _test:tx2 > /dev/null 2>&1

# Test 6: Memory Info
echo ""
echo "Test 6: Memory"
USED_MEMORY=$($REDIS_CLI INFO memory 2>/dev/null | grep used_memory_human | head -1 | cut -d':' -f2 | tr -d '\r')
if [ -n "$USED_MEMORY" ]; then
    pass_test "Memory reporting (using: $USED_MEMORY)"
else
    fail_test "Memory" "Unable to retrieve memory info"
fi

# Cleanup any leftover test keys
$REDIS_CLI DEL _test:ttl _test:list _test:set _test:hash _test:zset _test:counter _test:tx1 _test:tx2 > /dev/null 2>&1

# Summary
echo ""
echo "=========================================================="
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}  Failed: ${RED}$TESTS_FAILED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    exit 1
fi

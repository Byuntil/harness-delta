#!/usr/bin/env python3
"""One private PTY/process owner. fd3 EOF survives a lost Node observer.
Only fresh descendants' PID/UID/start/group metadata is sampled; no args/content.
No claim about unknowable escaped processes or backend cancellation is made.
"""
import errno
import fcntl
import json
import os
import pty
import select
import signal
import struct
import subprocess
import sys
import termios
import time

cfg = json.loads(sys.argv[1])
started = time.monotonic()
deadline = started + cfg['durationMs'] / 1000
uid = os.getuid()
ps_env = dict(os.environ, LC_ALL='C', TZ='UTC')
known = {}
escape_seen = False
group_changes = []
group_changes_truncated = False
# An observer that stops draining output must not block the independent deadline.
os.set_blocking(1, False)

def emit(value):
    sys.stderr.write(json.dumps(value) + '\n')
    sys.stderr.flush()

def metadata(pid):
    try:
        text = subprocess.check_output(['ps', '-o', 'pid=,ppid=,pgid=,uid=,lstart=', '-p', str(pid)], env=ps_env, timeout=.2, stderr=subprocess.DEVNULL).decode().strip().split(None, 4)
        if len(text) != 5:
            return None
        return (int(text[0]), int(text[1]), int(text[2]), int(text[3]), text[4])
    except (OSError, subprocess.SubprocessError, ValueError):
        return None

def same(record):
    current = metadata(record[0])
    return current is not None and current[0] == record[0] and current[3:] == record[3:]

def note_group_change(previous, current):
    global group_changes_truncated
    if previous is not None and previous[2] == current[2]:
        return
    if previous is None and current[2] == pid:
        return
    if len(group_changes) >= 16:
        group_changes_truncated = True
        return
    # Only metadata already sampled for owned members; no extra query or content.
    group_changes.append({'pid': current[0], 'ppid': current[1], 'uid': current[3],
                          'startedAt': current[4],
                          'fromPgid': previous[2] if previous else None,
                          'toPgid': current[2]})

def discover():
    global escape_seen
    pending = list(known.values())
    for record in pending:
        if not same(record):
            continue
        # PGID/PPID may change while PID/UID/start remain the same owned member.
        # Refresh mutable groups instead of treating a known escape as exit.
        current = metadata(record[0])
        if current is None or current[0] != record[0] or current[3:] != record[3:]:
            continue
        note_group_change(record, current)
        known[record[0]] = current
        escape_seen = escape_seen or current[2] != pid
        try:
            children = subprocess.run(['pgrep', '-P', str(record[0])], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=.2, check=False).stdout.split()
        except (OSError, subprocess.SubprocessError):
            return False
        for child in children:
            fresh = metadata(int(child))
            if fresh and fresh[1] == record[0] and fresh[3] == uid:
                if fresh[0] not in known:
                    note_group_change(None, fresh)
                known.setdefault(fresh[0], fresh)
        if len(known) > 32:
            return False
    return True

def group_exists(group):
    try:
        os.killpg(group, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True

ack_read, ack_write = os.pipe()
pid, master = pty.fork()
if pid == 0:
    try:
        os.close(ack_read)
        tty = os.open('/dev/tty', os.O_RDWR)
        os.close(tty)
        os.write(ack_write, b'TTY')
        os.close(ack_write)
        os.chdir(cfg['cwd'])
        os.execv(cfg['command'], [cfg['command']] + cfg['args'])
    except BaseException:
        os._exit(121)
root_exit = None
status = 'failed'
termination_cause = 'owner_error'
coverage = False
tty_verified = False
try:
    # Every fallible parent setup/ack/emission after fork is under cleanup.
    root = metadata(pid)
    if root:
        known[pid] = root
    os.close(ack_write)
    ready = select.select([ack_read], [], [], 1)[0]
    tty_verified = bool(ready and os.read(ack_read, 3) == b'TTY')
    os.close(ack_read)
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', cfg.get('rows', 24), cfg.get('columns', 80), 0, 0))
    emit({'type': 'spawn', 'pid': pid, 'controllingTerminal': tty_verified})
    status = 'completed'
    coverage = bool(root and tty_verified)
    while True:
        coverage = discover() and coverage
        ended, result = os.waitpid(pid, os.WNOHANG)
        if ended:
            root_exit = os.waitstatus_to_exitcode(result)
            status = 'completed' if root_exit == 0 else 'failed'
            termination_cause = 'root_exit'
            break
        if time.monotonic() >= deadline:
            status = 'timed_out'
            termination_cause = 'deadline'
            break
        readable = select.select([master, 0, 3], [], [], .02)[0]
        if 3 in readable:
            # Explicit stop AND parent death/pipe EOF both terminate the native.
            os.read(3, 32)
            status = 'stopped'
            termination_cause = 'control'
            break
        if 0 in readable:
            data = os.read(0, 4096)
            if data:
                os.write(master, data)
        if master in readable:
            try:
                data = os.read(master, 65536)
                if data:
                    os.write(1, data)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
except BaseException:
    status = 'failed'
    termination_cause = 'owner_error'
    coverage = False
finally:
    discover()
    escaped = escape_seen or any(record[2] != pid and same(record) for record in known.values())
    groups = {pid}
    # Additional groups may be targeted only when their freshly recorded leader
    # is still the same owned descendant; never attach to a pre-existing group.
    groups.update(record[2] for record in known.values() if record[0] == record[2] and same(record))
    def send(sig):
        for group in groups:
            try:
                leader = known.get(group)
                current = metadata(group) if leader and same(leader) else None
                if group_exists(group) and (group == pid or current and current[2] == group):
                    os.killpg(group, sig)
            except OSError:
                pass
        for record in known.values():
            if same(record):
                try:
                    os.kill(record[0], sig)
                except OSError:
                    pass
    until = time.monotonic() + cfg['terminationMs'] / 1000
    send(signal.SIGTERM)
    grace = min(until, time.monotonic() + cfg['termGraceMs'] / 1000)
    while any(group_exists(g) for g in groups) and time.monotonic() < grace:
        if root_exit is None:
            ended, result = os.waitpid(pid, os.WNOHANG)
            if ended:
                root_exit = os.waitstatus_to_exitcode(result)
        time.sleep(.01)
    send(signal.SIGKILL)
    while time.monotonic() < until:
        if root_exit is None:
            ended, result = os.waitpid(pid, os.WNOHANG)
            if ended:
                root_exit = os.waitstatus_to_exitcode(result)
        if root_exit is not None and not any(group_exists(g) for g in groups) and not any(same(record) for record in known.values()):
            break
        time.sleep(.01)
    verified = coverage and root_exit is not None and not any(group_exists(g) for g in groups) and not any(same(record) for record in known.values())
    try:
        emit({'type': 'result', 'status': status if verified and not escaped else 'failed', 'pid': pid, 'exitCode': root_exit, 'terminationVerified': verified, 'controllingTerminal': tty_verified, 'escapedMemberObserved': escaped, 'ownedMembers': len(known), 'terminationCause': termination_cause, 'groupChanges': group_changes, 'groupChangesTruncated': group_changes_truncated})
    except BrokenPipeError:
        pass  # Observer lost; teardown still completed in this independent owner.
    os.close(master)

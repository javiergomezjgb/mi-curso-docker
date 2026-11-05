import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import worker  # noqa: E402


class RespTest(unittest.TestCase):
    def test_encode(self):
        self.assertEqual(worker.encode("PING"), b"*1\r\n$4\r\nPING\r\n")

    def test_parse_simple(self):
        self.assertEqual(worker.parse(b"+PONG\r\n")[0], "PONG")
        self.assertEqual(worker.parse(b":3\r\n")[0], 3)

    def test_parse_array(self):
        self.assertEqual(worker.parse(b"*2\r\n$4\r\njobs\r\n$2\r\nhi\r\n")[0], ["jobs", "hi"])

    def test_parse_incompleto(self):
        self.assertIsNone(worker.parse(b"$5\r\nab"))


if __name__ == "__main__":
    unittest.main()

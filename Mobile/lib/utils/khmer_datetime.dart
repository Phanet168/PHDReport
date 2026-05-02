import 'package:intl/intl.dart';

String formatKhmerDateTime(DateTime dt) {
  // Basic placeholder; Phase 2 can map Khmer month names like in web.
  return DateFormat('yyyy-MM-dd HH:mm:ss').format(dt);
}

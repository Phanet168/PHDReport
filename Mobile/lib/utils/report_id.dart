String composeReportId(String periodId, String indicatorId, String unitId) {
  // Same idea as web: avoid delimiter collision
  final p = Uri.encodeComponent(periodId.trim());
  final i = Uri.encodeComponent(indicatorId.trim());
  final u = Uri.encodeComponent(unitId.trim());
  return '${p}__${i}__${u}';
}

set +e
echo INSTALL_START >/data/tmp-patch/install.status
if dd if=/data/tmp-patch/patch.part001 of=/dev/resource bs=65536 seek=1768 count=16 conv=notrunc; then echo W001_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part002 of=/dev/resource bs=65536 seek=1784 count=16 conv=notrunc; then echo W002_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part003 of=/dev/resource bs=65536 seek=1800 count=16 conv=notrunc; then echo W003_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part004 of=/dev/resource bs=65536 seek=1816 count=16 conv=notrunc; then echo W004_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part005 of=/dev/resource bs=65536 seek=1832 count=16 conv=notrunc; then echo W005_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part006 of=/dev/resource bs=65536 seek=1848 count=16 conv=notrunc; then echo W006_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part007 of=/dev/resource bs=65536 seek=1864 count=16 conv=notrunc; then echo W007_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part008 of=/dev/resource bs=65536 seek=1880 count=7 conv=notrunc; then echo W008_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part009 of=/dev/resource bs=16 seek=7729152 count=2739 conv=notrunc; then echo W009_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part000 of=/dev/resource bs=16 seek=7237789 count=3939 conv=notrunc; then echo W000_OK >>/data/tmp-patch/install.status; fi
